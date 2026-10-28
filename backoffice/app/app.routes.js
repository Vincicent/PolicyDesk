// Routes (ui-router "states") and the route guard.
(function () {
  'use strict';

  angular.module('backoffice').config(configureRoutes).run(guardRoutes);

  configureRoutes.$inject = ['$stateProvider', '$urlRouterProvider', '$httpProvider'];
  function configureRoutes($stateProvider, $urlRouterProvider, $httpProvider) {
    $stateProvider
      .state('login', {
        url: '/login',
        component: 'loginPage',
      })
      .state('requests', {
        url: '/requests',
        component: 'requestList',
      })
      .state('requestDetail', {
        url: '/requests/{id:int}',
        component: 'requestDetail',
        // `resolve` loads data BEFORE the page shows; the result arrives in the component's `request` binding.
        resolve: {
          request: [
            '$transition$',
            'requestsService',
            function ($transition$, requestsService) {
              return requestsService.get($transition$.params().id);
            },
          ],
        },
      });
    $urlRouterProvider.otherwise('/requests');

    // Every $http call goes through this interceptor (adds the token, handles 401).
    $httpProvider.interceptors.push('authInterceptor');
  }

  guardRoutes.$inject = ['$transitions', 'authService'];
  function guardRoutes($transitions, authService) {
    // Before entering any state except login: signed in? If not, go to login instead.
    var notLogin = function (state) {
      return state.name !== 'login';
    };
    $transitions.onBefore({ to: notLogin }, function (transition) {
      if (!authService.isSignedIn()) return transition.router.stateService.target('login');
    });
  }
})();