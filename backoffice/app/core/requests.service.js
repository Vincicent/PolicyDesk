// All calls about requests. Components never use $http directly: they ask this service.
(function () {
  'use strict';

  angular.module('backoffice').factory('requestsService', requestsService);

  requestsService.$inject = ['$http', '$q'];
  function requestsService($http, $q) {
    var data = function (response) {
      return response.data;
    };

    return {
      list: function () {
        return $http.get('/api/requests').then(data);
      },
      // Two calls in parallel, one promise: the request + the fund names (to show a fund switch).
      get: function (id) {
        return $q
          .all({ request: $http.get('/api/requests/' + id), funds: $http.get('/api/funds') })
          .then(function (results) {
            var request = results.request.data;
            request.fundNames = {};
            results.funds.data.forEach(function (f) {
              request.fundNames[f.id] = f.name;
            });
            return request;
          });
      },
      claim: function (id) {
        return $http.post('/api/requests/' + id + '/claim').then(data);
      },
      decide: function (id, decision, comment) {
        return $http.post('/api/requests/' + id + '/decision', { decision: decision, comment: comment }).then(data);
      },
    };
  }
})();