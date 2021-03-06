/*
 * Copyright 2020 ZUP IT SERVICOS EM TECNOLOGIA E INOVACAO SA
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { JobWithDoneCallback } from 'pg-boss'
import { In, Repository } from 'typeorm'
import { CdConfigurationsRepository } from '../../../../v1/api/configurations/repository'
import { DeploymentStatusEnum } from '../../../../v1/api/deployments/enums'
import { IoCTokensConstants } from '../../../../v1/core/constants/ioc'
import IEnvConfiguration from '../../../../v1/core/integrations/configuration/interfaces/env-configuration.interface'
import { ConsoleLoggerService } from '../../../../v1/core/logs/console'
import { ComponentEntityV2 as ComponentEntity } from '../entity/component.entity'
import { DeploymentEntityV2 as DeploymentEntity } from '../entity/deployment.entity'
import { Execution } from '../entity/execution.entity'
import { ExecutionTypeEnum } from '../enums'
import { PgBossWorker } from '../jobs/pgboss.worker'
import { ComponentsRepositoryV2 } from '../repository'
import { CdStrategyFactory } from '../../../core/integrations/cd-strategy-factory'

type ExecutionJob = JobWithDoneCallback<Execution, unknown>

@Injectable()
export class DeploymentHandlerUseCase {

  constructor(
    private readonly consoleLoggerService: ConsoleLoggerService,
    @InjectRepository(ComponentsRepositoryV2)
    private componentsRepository: ComponentsRepositoryV2,
    @InjectRepository(DeploymentEntity)
    private deploymentsRepository: Repository<DeploymentEntity>,
    @InjectRepository(CdConfigurationsRepository)
    private cdConfigurationsRepository: CdConfigurationsRepository,
    @Inject(forwardRef(() => PgBossWorker))
    private pgBoss: PgBossWorker,
    private cdStrategy: CdStrategyFactory,
    @Inject(IoCTokensConstants.ENV_CONFIGURATION)
    private envConfiguration: IEnvConfiguration,
  ) { }

  public async run(job: ExecutionJob): Promise<ExecutionJob> {
    const deployment = await this.validateDeployment(job)

    if (job.data.status === DeploymentStatusEnum.TIMED_OUT) { //TODO Create ExecutionStatusEnum or rename this enum
      const error = new Error('Deployment timed out')
      job.done(error)
      throw error
    }
    const overlappingComponents = await this.getOverlappingComponents(deployment)

    if (overlappingComponents.length > 0) {
      return await this.handleOverlap(job)
    }

    switch (job.data.type) {
      case ExecutionTypeEnum.DEPLOYMENT:
        return await this.runDeployment(deployment, job)
      case ExecutionTypeEnum.UNDEPLOYMENT:
        return await this.runUndeployment(deployment, job)
      default:
        return this.handleInvalidExecutionType(job)
    }
  }

  private async runDeployment(deployment: DeploymentEntity, job: ExecutionJob): Promise<ExecutionJob> {
    this.consoleLoggerService.log('START:RUN_DEPLOYMENT_EXECUTION', { deployment: deployment.id, job: job.id })
    if (deployment.defaultCircle) {
      deployment.components = deployment.components.filter(c => !c.merged)
    }
    const activeComponents = await this.componentsRepository.findActiveComponents()
    this.consoleLoggerService.log('GET:ACTIVE_COMPONENTS', { activeComponents: activeComponents.map(c => c.id) })

    try {
      await this.updateComponentsRunningStatus(deployment, true)
      const cdConnector = this.cdStrategy.create(deployment.cdConfiguration.type)
      const cdResponse = await cdConnector.createDeployment(
        deployment,
        activeComponents,
        { executionId: job.data.id, incomingCircleId: job.data.incomingCircleId }
      )
      return cdResponse.status === 'ERROR' ?
        await this.handleCdError(job, cdResponse.error, deployment) :
        await this.handleCdSuccess(job)
    } catch(error) {
      this.consoleLoggerService.log('ERROR:RUN_DEPLOYMENT_EXECUTION', { error })
      return this.handleCdError(job, error, deployment)
    }
  }

  private async runUndeployment(deployment: DeploymentEntity, job: ExecutionJob): Promise<ExecutionJob> {
    this.consoleLoggerService.log('START:RUN_UNDEPLOYMENT_EXECUTION', { deployment: deployment.id, job: job.id })
    const activeComponents = await this.componentsRepository.findActiveComponents()
    this.consoleLoggerService.log('GET:ACTIVE_COMPONENTS', { activeComponents: activeComponents.map(c => c.id) })

    try {
      await this.updateComponentsRunningStatus(deployment, true)
      const cdConnector = this.cdStrategy.create(deployment.cdConfiguration.type)
      const cdResponse = await cdConnector.createUndeployment(
        deployment,
        activeComponents,
        { executionId: job.data.id, incomingCircleId: job.data.incomingCircleId }
      )
      return cdResponse.status === 'ERROR' ?
        await this.handleCdError(job, cdResponse.error, deployment) :
        await this.handleCdSuccess(job)
    } catch(error) {
      this.consoleLoggerService.log('ERROR:RUN_UNDEPLOYMENT_EXECUTION', { error })
      return this.handleCdError(job, error, deployment)
    }
  }

  private handleInvalidExecutionType(job: ExecutionJob): ExecutionJob {
    this.consoleLoggerService.log('ERROR:INVALID_EXECUTION_TYPE', { type: job.data.type })
    job.done(new Error('Invalid execution type'))
    return job
  }

  public async validateDeployment(job: ExecutionJob): Promise<DeploymentEntity> {
    const deployment = await this.deploymentFromExecution(job.data)
    if (!deployment) {
      const error = new Error('Deployment not found')
      job.done(error)
      this.consoleLoggerService.error('ERROR:DEPLOYMENT_NOT_FOUND', { job: job.id })
      throw error
    }
    return deployment
  }

  public async handleOverlap(job: ExecutionJob): Promise<ExecutionJob> {
    await this.pgBoss.publishWithPriority(job.data)
    this.consoleLoggerService.log('Overlapping components, requeing the job', { job: job.id })
    job.done()
    return job
  }

  public async handleCdSuccess(job: ExecutionJob) : Promise<ExecutionJob> {
    this.consoleLoggerService.log('FINISH:RUN_EXECUTION Updated components to running', { job: job.id })
    job.done()
    return job
  }

  public async handleCdError(job: ExecutionJob, error: string, deployment: DeploymentEntity): Promise<ExecutionJob> {
    await this.updateComponentsRunningStatus(deployment, false)
    this.consoleLoggerService.error('FINISH:RUN_EXECUTION CD Response error', { job: job.id, error })
    job.done(new Error(error))
    return job
  }

  public async deploymentFromExecution(execution: Execution): Promise<DeploymentEntity | undefined> {
    const deployment = await this.deploymentsRepository.findOne({ where: { id: execution.deployment.id }, relations: ['components', 'cdConfiguration'] })

    if (deployment)
      deployment.cdConfiguration = await this.cdConfigurationsRepository.findDecrypted(deployment.cdConfiguration.id)

    return deployment
  }

  public async findComponentsByName(deployment: DeploymentEntity): Promise<ComponentEntity[]> {
    const names = deployment.components.map(c => c.name)
    return await this.componentsRepository.find({ where: { name: In(names), deployment: deployment } })
  }

  public async updateComponentsRunningStatus(deployment: DeploymentEntity, status: boolean): Promise<DeploymentEntity> { // TODO extract all these database methods to custom repo/class
    for await (const c of deployment.components) {
      await this.componentsRepository.update({ id: c.id }, { running: status })
    }
    return this.deploymentsRepository.findOneOrFail(deployment.id)
  }

  public async getOverlappingComponents(deployment: DeploymentEntity): Promise<ComponentEntity[]> {
    const deploymentComponents = await this.findComponentsByName(deployment)
    const allRunningComponents = await this.componentsRepository.find({ where: { running: true } })
    const overlap = allRunningComponents.filter( c => deploymentComponents.some(dc => dc.name === c.name))
    return overlap
  }
}
