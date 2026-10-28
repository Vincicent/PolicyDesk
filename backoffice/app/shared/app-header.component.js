// A component = a directive with good defaults: element, isolate scope, controller as $ctrl.
(function () {
  'use strict';

  angular.module('backoffice').component('appHeader', {
    template:
      '<header class="topbar">' +
      '  <h1>PolicyDesk · Back-office</h1>' +
      '  <div class="who" ng-if="$ctrl.user()">' +
      '    <span>{{ $ctrl.user().displayName }} (underwriter)</span>' +
      '    <button type="button" ng-click="$ctrl.logout()">Sign out</button>' +
      '  </div>' +
      '</header>',
    controller: AppHeaderController,
  });

  AppHeaderController.$inject = ['authService', '$state'];
  function AppHeaderController(authService, $state) {
    var $ctrl = this;
    $ctrl.user = authService.user;
    $ctrl.logout = function () {
      authService.logout();
      $state.go('login');
    };
  }
})();