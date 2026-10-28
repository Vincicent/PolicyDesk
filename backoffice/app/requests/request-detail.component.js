// One request: what the broker asks, the policy it is about, and the underwriter's decision.
(function () {
  'use strict';

  angular.module('backoffice').component('requestDetail', {
    templateUrl: 'app/requests/request-detail.html',
    bindings: {
      request: '<', // one-way binding, filled by the route's `resolve`
    },
    controller: RequestDetailController,
  });

  RequestDetailController.$inject = ['requestsService', '$state'];
  function RequestDetailController(requestsService, $state) {
    var $ctrl = this;

    $ctrl.$onInit = function () {
      $ctrl.decision = { choice: 'approve', comment: '' };
      $ctrl.busy = false;
      $ctrl.error = null;
    };

    $ctrl.isOpen = function () {
      return $ctrl.request.status === 'pending' || $ctrl.request.status === 'in_review';
    };

    $ctrl.claim = function () {
      run(requestsService.claim($ctrl.request.id));
    };

    $ctrl.submitDecision = function (form) {
      if (form.$invalid) return;
      run(requestsService.decide($ctrl.request.id, $ctrl.decision.choice, $ctrl.decision.comment)).then(function (ok) {
        if (ok) $state.go('requests');
      });
    };

    // Runs an action, then reloads the request (status, assignee and decision changed).
    function run(promise) {
      $ctrl.busy = true;
      $ctrl.error = null;
      return promise
        .then(function () {
          return requestsService.get($ctrl.request.id);
        })
        .then(function (fresh) {
          $ctrl.request = fresh;
          return true;
        })
        .catch(function (response) {
          $ctrl.error = response.data && response.data.error ? response.data.error.message : 'Something went wrong';
          return false;
        })
        .finally(function () {
          $ctrl.busy = false;
        });
    }
  }
})();