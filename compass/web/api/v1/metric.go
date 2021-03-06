/*
 *
 *  Copyright 2020 ZUP IT SERVICOS EM TECNOLOGIA E INOVACAO SA
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

package v1

import (
	"github.com/ZupIT/charlescd/compass/internal/metric"
	"github.com/ZupIT/charlescd/compass/internal/metricsgroup"
	"github.com/ZupIT/charlescd/compass/web/api"
	"net/http"

	"github.com/google/uuid"
	"github.com/julienschmidt/httprouter"
)

type MetricApi struct {
	metricMain      metric.UseCases
	metricGroupMain metricsgroup.UseCases
}

func (v1 V1) NewMetricApi(metricMain metric.UseCases, metricGroupMain metricsgroup.UseCases) MetricApi {
	apiPath := "/metrics-groups"
	metricApi := MetricApi{metricMain, metricGroupMain}
	v1.Router.POST(v1.getCompletePath(apiPath)+"/:id/metrics", api.HttpValidator(metricApi.createMetric))
	v1.Router.PUT(v1.getCompletePath(apiPath+"/:id/metrics/:metricId"), api.HttpValidator(metricApi.updateMetric))
	v1.Router.DELETE(v1.getCompletePath(apiPath+"/:id/metrics/:metricId"), api.HttpValidator(metricApi.deleteMetric))
	return metricApi
}

func (metricApi MetricApi) createMetric(w http.ResponseWriter, r *http.Request, ps httprouter.Params, workspaceId string) {
	id := ps.ByName("id")
	metric, err := metricApi.metricMain.ParseMetric(r.Body)

	if err != nil {
		api.NewRestError(w, http.StatusInternalServerError, []error{err})
		return
	}

	if err := metricApi.metricMain.Validate(metric); len(err) > 0 {
		api.NewRestValidateError(w, http.StatusInternalServerError, err, "Could not save metric")
		return
	}

	metricgroup, err := metricApi.metricGroupMain.FindById(id)
	if err != nil {
		api.NewRestError(w, http.StatusInternalServerError, []error{err})
		return
	}

	metric.MetricsGroupID, err = uuid.Parse(id)
	metric.CircleID = metricgroup.CircleID
	createdMetric, err := metricApi.metricMain.SaveMetric(metric)
	if err != nil {
		api.NewRestError(w, http.StatusInternalServerError, []error{err})
		return
	}

	api.NewRestSuccess(w, http.StatusOK, createdMetric)
}

func (metricApi MetricApi) updateMetric(w http.ResponseWriter, r *http.Request, ps httprouter.Params, workspaceId string) {
	groupID := ps.ByName("id")
	metricID := ps.ByName("metricId")
	metric, err := metricApi.metricMain.ParseMetric(r.Body)
	if err != nil {
		api.NewRestError(w, http.StatusInternalServerError, []error{err})
		return
	}

	if err := metricApi.metricMain.Validate(metric); len(err) > 0 {
		api.NewRestValidateError(w, http.StatusInternalServerError, err, "Could not update metric")
		return
	}

	metricgroup, err := metricApi.metricGroupMain.FindById(groupID)
	if err != nil {
		api.NewRestError(w, http.StatusInternalServerError, []error{err})
		return
	}

	metric.ID, _ = uuid.Parse(metricID)
	metric.MetricsGroupID, _ = uuid.Parse(groupID)
	metric.CircleID = metricgroup.CircleID
	updatedMetric, err := metricApi.metricMain.UpdateMetric(metricID, metric)
	if err != nil {
		api.NewRestError(w, http.StatusInternalServerError, []error{err})
		return
	}

	api.NewRestSuccess(w, http.StatusOK, updatedMetric)
}

func (metricApi MetricApi) deleteMetric(w http.ResponseWriter, r *http.Request, ps httprouter.Params, workspaceId string) {
	id := ps.ByName("metricId")
	err := metricApi.metricMain.RemoveMetric(string(id))
	if err != nil {
		api.NewRestError(w, http.StatusInternalServerError, []error{err})
		return
	}

	api.NewRestSuccess(w, http.StatusNoContent, nil)
}
