(function () {
  'use strict';

  angular.module('backoffice').component('requestList', {
    templateUrl: 'app/requests/request-list.html',
    controller: RequestListController,
  });

  RequestListController.$inject = ['requestsService', 'authService', '$state', '$interval'];
  function RequestListController(requestsService, authService, $state, $interval) {
    var $ctrl = this;
    var refresher;

    $ctrl.$onInit = function () {
      $ctrl.requests = [];
      $ctrl.brokers = [];
      $ctrl.filters = { status: 'open', text: '', broker: null, mineOnly: false };
      $ctrl.sort = { field: 'createdAt', reverse: true };
      $ctrl.lastRefresh = null;
      $ctrl.load();
      refresher = $interval($ctrl.load, 60000);
    };

    // Components get $onDestroy: no need for $scope.$on('$destroy') any more.
    $ctrl.$onDestroy = function () {
      $interval.cancel(refresher);
    };

    $ctrl.load = function () {
      return requestsService.list().then(function (requests) {
        $ctrl.requests = requests;
        $ctrl.brokers = uniqueBrokers(requests);
        $ctrl.lastRefresh = new Date();
      });
    };

    $ctrl.open = function (request) {
      $state.go('requestDetail', { id: request.id });
    };

    $ctrl.matchesStatus = function (request) {
      if ($ctrl.filters.broker && request.brokerName !== $ctrl.filters.broker) return false;
      if ($ctrl.filters.mineOnly && request.assignedToName !== authService.user().displayName) return false;
      switch ($ctrl.filters.status) {
        case 'all':
          return true;
        case 'open':
          return request.status === 'pending' || request.status === 'in_review';
        default:
          return request.status === $ctrl.filters.status;
      }
    };

    $ctrl.countByStatus = function (status) {
      return $ctrl.requests.filter(function (r) {
        return r.status === status;
      }).length;
    };

    $ctrl.sortBy = function (field) {
      $ctrl.sort.reverse = $ctrl.sort.field === field ? !$ctrl.sort.reverse : false;
      $ctrl.sort.field = field;
    };

    $ctrl.sortArrow = function (field) {
      if ($ctrl.sort.field !== field) return '';
      return $ctrl.sort.reverse ? '▼' : '▲';
    };

    function uniqueBrokers(requests) {
      var names = [];
      requests.forEach(function (r) {
        if (names.indexOf(r.brokerName) === -1) names.push(r.brokerName);
      });
      return names.sort();
    }
  }
})();