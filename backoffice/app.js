angular
  .module('backoffice', [])

  // The array syntax ['$scope', '$http', function ($scope, $http) {...}] tells the injector WHAT to inject.
  // Without it, a minifier renames $http to `a` and the app breaks.
  .controller('QueueController', [
    '$scope',
    '$http',
    '$interval',
    function ($scope, $http, $interval) {
      var token = null; // not on $scope: the template doesn't need it

      $scope.credentials = { username: 'martin', password: '' };
      $scope.user = null;
      $scope.error = null;
      $scope.requests = [];
      $scope.filters = { status: 'open', text: '', broker: null };
      $scope.brokers = [];
      $scope.lastRefresh = null;
      $scope.sort = { field: 'createdAt', reverse: true };

      $scope.login = function () {
        $scope.error = null;
        $http.post('/api/login', $scope.credentials).then(
          function (response) {
            token = response.data.token;
            $scope.user = response.data.user;
            $scope.loadRequests();
          },
          function (response) {
            $scope.error = response.data && response.data.error ? response.data.error.message : 'Cannot reach the server';
          },
        );
      };

      $scope.logout = function () {
        token = null;
        $scope.user = null;
        $scope.requests = [];
        $scope.credentials.password = '';
      };

      $scope.loadRequests = function () {
        $http.get('/api/requests', { headers: { Authorization: 'Bearer ' + token } }).then(function (response) {
          $scope.requests = response.data;
          $scope.brokers = uniqueBrokers(response.data);
          $scope.lastRefresh = new Date();
        });
      };

      function uniqueBrokers(requests) {
        var names = [];
        requests.forEach(function (r) {
          if (names.indexOf(r.brokerName) === -1) names.push(r.brokerName);
        });
        return names.sort();
      }

      // Refresh every 60 s. $interval (not setInterval) runs a digest after each tick,
      // so the page updates. Cancel it when the scope dies, or it keeps running forever.
      var refresher = $interval(function () {
        if (token) $scope.loadRequests();
      }, 60000);
      $scope.$on('$destroy', function () {
        $interval.cancel(refresher);
      });

      // Used by `filter:matchesStatus` in the template: AngularJS calls it once per request.
      $scope.matchesStatus = function (request) {
        if ($scope.filters.broker && request.brokerName !== $scope.filters.broker) return false;
        switch ($scope.filters.status) {
          case 'all':
            return true;
          case 'open':
            return request.status === 'pending' || request.status === 'in_review';
          default:
            return request.status === $scope.filters.status;
        }
      };

      $scope.countByStatus = function (status) {
        return $scope.requests.filter(function (r) {
          return r.status === status;
        }).length;
      };

      $scope.sortBy = function (field) {
        $scope.sort.reverse = $scope.sort.field === field ? !$scope.sort.reverse : false;
        $scope.sort.field = field;
      };

      $scope.sortArrow = function (field) {
        if ($scope.sort.field !== field) return '';
        return $scope.sort.reverse ? '▼' : '▲';
      };
    },
  ])

  // A filter turns a value into display text: {{ r.type | requestType }}
  .filter('requestType', function () {
    var labels = { fund_switch: 'Fund switch', partial_surrender: 'Partial surrender', extra_premium: 'Extra premium' };
    return function (type) {
      return labels[type] || type;
    };
  })

  .filter('statusLabel', function () {
    var labels = { pending: 'Pending', in_review: 'In review', approved: 'Approved', rejected: 'Rejected' };
    return function (status) {
      return labels[status] || status;
    };
  });