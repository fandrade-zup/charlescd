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

import styled from 'styled-components';
import IconComponent from 'core/components/Icon';

interface Props {
  color: string;
}

const Notification = styled.div<Props>`
  position: relative;
  width: 100%;
  height: 100%;
  background: ${({ theme, color }) => theme.notification[color]};
  display: flex;
  flex-direction: row;
`;

const Wrapper = styled.div`
  display: flex;
  justify-content: center;
  margin: auto;

  span {
    padding: 0 0 5px 5px;
  }
`;

const Icon = styled(IconComponent)`
  position: absolute;
  top: 5px;
  right: 10px;
`;

export default {
  Notification,
  Wrapper,
  Icon
};
