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

package datasource

import (
	"encoding/json"
	"github.com/ZupIT/charlescd/compass/internal/plugin"
	"github.com/ZupIT/charlescd/compass/internal/util"
	"github.com/ZupIT/charlescd/compass/pkg/datasource"
	"io"

	"github.com/jinzhu/gorm"
)

type UseCases interface {
	Parse(dataSource io.ReadCloser) (DataSource, error)
	FindAllByWorkspace(workspaceID string, health string) ([]DataSource, error)
	FindHealthByWorkspaceId(workspaceID string) (DataSource, error)
	FindById(id string) (DataSource, error)
	Save(dataSource DataSource) (DataSource, error)
	Delete(id string) error
	GetMetrics(dataSourceID, name string) (datasource.MetricList, error)
	Validate(dataSource DataSource) []util.ErrorUtil
	TestConnection(pluginSrc string, datasourceData json.RawMessage) error
}

type Main struct {
	db         *gorm.DB
	pluginMain plugin.UseCases
}

func NewMain(db *gorm.DB, pluginMain plugin.UseCases) UseCases {
	return Main{db, pluginMain}
}
