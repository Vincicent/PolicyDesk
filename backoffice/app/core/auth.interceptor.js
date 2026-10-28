// An $http interceptor sees every request and response of the app.
(function () {
  'use strict';

  angular.module('backoffice').factory('authInterceptor', authInterceptor);

  // $injector, not $state/authService directly: $http needs the interceptor, and authService needs $http,
  // so injecting authService here would be a circular dependency. We look it up lazily instead.
  authInterceptor.$inject = ['$q', '$injector'];
  function authInterceptor($q, $injector) {
    return {
      request: function (config) {
        var token = $injector.get('authService').token();
        if (token && config.url.indexOf('/api/') === 0) {
          config.headers = config.headers || {};
          config.headers.Authorization = 'Bearer ' + token;
        }
        return config;
      },
      responseError: function (rejection) {
        if (rejection.status === 401 && rejection.config.url !== '/api/login') {
          $injector.get('authService').logout();
          $injector.get('$state').go('login');
        }
        return $q.reject(rejection); // keep the error flowing to whoever made the call
      },
    };
  }
})();