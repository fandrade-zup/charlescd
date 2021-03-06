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

import React, { memo } from 'react';
import { useHistory } from 'react-router-dom';
import { saveWorkspace } from 'core/utils/workspace';
import { setUserAbilities } from 'core/utils/abilities';
import { useDispatch, useGlobalState } from 'core/state/hooks';
import {
  statusWorkspaceAction,
  loadedWorkspaceAction
} from 'modules/Workspaces/state/actions';
import { hasPermission } from 'core/utils/auth';
import { WORKSPACE_STATUS } from '../enums';
import routes from 'core/constants/routes';
import Styled from './styled';

interface Props {
  id: string;
  name: string;
  status: string;
  selectedWorkspace: (name: string) => void;
}

const MenuItem = ({ id, name, status, selectedWorkspace }: Props) => {
  const dispatch = useDispatch();
  const history = useHistory();
  const { item: workspace } = useGlobalState(({ workspaces }) => workspaces);

  const handleClick = () => {
    saveWorkspace({ id, name });
    selectedWorkspace(name);
    setUserAbilities();
    dispatch(statusWorkspaceAction('idle'));
    dispatch(loadedWorkspaceAction({ ...workspace, id, name, status }));
    history.push({
      pathname:
        status === WORKSPACE_STATUS.INCOMPLETE &&
        hasPermission('maintenance_write')
          ? routes.credentials
          : routes.circles
    });
  };

  return (
    <Styled.Link onClick={handleClick} data-testid={`workspace-${name}`}>
      <Styled.ListItem icon="workspace" marginContent="8px">
        <Styled.Item color="light">{name}</Styled.Item>
      </Styled.ListItem>
    </Styled.Link>
  );
};

export default memo(MenuItem);
