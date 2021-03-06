/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import React from 'react';
import PropTypes from 'prop-types';
import { t } from '@superset-ui/translation';

import getChartIdsFromLayout from '../util/getChartIdsFromLayout';
import getLayoutComponentFromChartId from '../util/getLayoutComponentFromChartId';
import DashboardBuilder from '../containers/DashboardBuilder';
import {
  chartPropShape,
  slicePropShape,
  dashboardInfoPropShape,
  dashboardStatePropShape,
  loadStatsPropShape,
} from '../util/propShapes';
import { areObjectsEqual } from '../../reduxUtils';
import { LOG_ACTIONS_MOUNT_DASHBOARD } from '../../logger/LogUtils';
import OmniContainer from '../../components/OmniContainer';
import { safeStringify } from '../../utils/safeStringify';

import '../stylesheets/index.less';

const propTypes = {
  actions: PropTypes.shape({
    addSliceToDashboard: PropTypes.func.isRequired,
    removeSliceFromDashboard: PropTypes.func.isRequired,
    triggerQuery: PropTypes.func.isRequired,
    logEvent: PropTypes.func.isRequired,
  }).isRequired,
  dashboardInfo: dashboardInfoPropShape.isRequired,
  dashboardState: dashboardStatePropShape.isRequired,
  charts: PropTypes.objectOf(chartPropShape).isRequired,
  slices: PropTypes.objectOf(slicePropShape).isRequired,
  filters: PropTypes.object.isRequired,
  datasources: PropTypes.object.isRequired,
  loadStats: loadStatsPropShape.isRequired,
  layout: PropTypes.object.isRequired,
  impressionId: PropTypes.string.isRequired,
  initMessages: PropTypes.array,
  timeout: PropTypes.number,
  userId: PropTypes.string,
};

const defaultProps = {
  initMessages: [],
  timeout: 60,
  userId: '',
};

class Dashboard extends React.PureComponent {
  // eslint-disable-next-line react/sort-comp
  static onBeforeUnload(hasChanged) {
    if (hasChanged) {
      window.addEventListener('beforeunload', Dashboard.unload);
    } else {
      window.removeEventListener('beforeunload', Dashboard.unload);
    }
  }

  static unload() {
    const message = t('You have unsaved changes.');
    window.event.returnValue = message; // Gecko + IE
    return message; // Gecko + Webkit, Safari, Chrome etc.
  }

  constructor(props) {
    super(props);
    this.appliedFilters = {};
  }

  componentDidMount() {
    this.props.actions.logEvent(LOG_ACTIONS_MOUNT_DASHBOARD);
  }

  componentWillReceiveProps(nextProps) {
    const currentChartIds = getChartIdsFromLayout(this.props.layout);
    const nextChartIds = getChartIdsFromLayout(nextProps.layout);

    if (currentChartIds.length < nextChartIds.length) {
      const newChartIds = nextChartIds.filter(
        key => currentChartIds.indexOf(key) === -1,
      );
      newChartIds.forEach(newChartId =>
        this.props.actions.addSliceToDashboard(
          newChartId,
          getLayoutComponentFromChartId(nextProps.layout, newChartId),
        ),
      );
    } else if (currentChartIds.length > nextChartIds.length) {
      // remove chart
      const removedChartIds = currentChartIds.filter(
        key => nextChartIds.indexOf(key) === -1,
      );
      removedChartIds.forEach(removedChartId =>
        this.props.actions.removeSliceFromDashboard(removedChartId),
      );
    }
  }

  componentDidUpdate() {
    const { hasUnsavedChanges, editMode } = this.props.dashboardState;

    const appliedFilters = this.appliedFilters;
    const { filters } = this.props;
    // do not apply filter when dashboard in edit mode
    if (!editMode && safeStringify(appliedFilters) !== safeStringify(filters)) {
      // refresh charts if a filter was removed, added, or changed
      let changedFilterKey = null;
      const currFilterKeys = Object.keys(filters);
      const appliedFilterKeys = Object.keys(appliedFilters);

      currFilterKeys.forEach(key => {
        if (
          // filter was added or changed
          typeof appliedFilters[key] === 'undefined' ||
          !areObjectsEqual(appliedFilters[key], filters[key])
        ) {
          changedFilterKey = key;
        }
      });

      if (
        !!changedFilterKey ||
        currFilterKeys.length !== appliedFilterKeys.length // remove 1 or more filters
      ) {
        this.refreshExcept(changedFilterKey);
        this.appliedFilters = filters;
      }
    }

    if (hasUnsavedChanges) {
      Dashboard.onBeforeUnload(true);
    } else {
      Dashboard.onBeforeUnload(false);
    }
  }

  // return charts in array
  getAllCharts() {
    return Object.values(this.props.charts);
  }

  refreshExcept(filterKey) {
    const { filters } = this.props;
    const currentFilteredNames =
      filterKey && filters[filterKey] ? Object.keys(filters[filterKey]) : [];
    const filterImmuneSlices = this.props.dashboardInfo.metadata
      .filterImmuneSlices;
    const filterImmuneSliceFields = this.props.dashboardInfo.metadata
      .filterImmuneSliceFields;

    this.getAllCharts().forEach(chart => {
      // filterKey is a string, filter_immune_slices array contains numbers
      if (
        String(chart.id) === filterKey ||
        filterImmuneSlices.includes(chart.id)
      ) {
        return;
      }

      const filterImmuneSliceFieldsNames =
        filterImmuneSliceFields[chart.id] || [];
      // has filter-able field names
      if (
        currentFilteredNames.length === 0 ||
        currentFilteredNames.some(
          name => !filterImmuneSliceFieldsNames.includes(name),
        )
      ) {
        this.props.actions.triggerQuery(true, chart.id);
      }
    });
  }

  render() {
    return (
      <React.Fragment>
        <OmniContainer logEvent={this.props.actions.logEvent} />
        <DashboardBuilder />
      </React.Fragment>
    );
  }
}

Dashboard.propTypes = propTypes;
Dashboard.defaultProps = defaultProps;

export default Dashboard;
