(function () {
  'use strict';

  angular.module('backoffice').component('loginPage', {
    templateUrl: 'app/login/login.html',
    controller: LoginController,
  });

  LoginController.$inject = ['authService', '$state'];
  function LoginController(authService, $state) {
    var $ctrl = this;

    // $onInit runs once the bindings are ready: initialise here, not in the constructor.
    $ctrl.$onInit = function () {
      if (authService.isSignedIn()) $state.go('requests');
      $ctrl.username = 'martin';
      $ctrl.password = '';
      $ctrl.error = null;
      $ctrl.busy = false;
    };

    $ctrl.submit = function () {
      $ctrl.error = null;
      $ctrl.busy = true;
      authService
        .login($ctrl.username, $ctrl.password)
        .then(function () {
          $state.go('requests');
        })
        .catch(function (err) {
          $ctrl.error = err.message || (err.data && err.data.error ? err.data.error.message : 'Cannot reach the server');
        })
        .finally(function () {
          $ctrl.busy = false;
        });
    };
  }
})();