(function () {
  'use strict';

  angular.module('backoffice').directive('boAutofocus', boAutofocus);

  boAutofocus.$inject = ['$timeout'];
  function boAutofocus($timeout) {
    return {
      restrict: 'A',
      // link runs once the element is in the DOM; `element` is a jqLite wrapper, element[0] the real node.
      link: function (scope, element) {
        // $timeout(fn, 0): wait until ng-if/ui-view have finished inserting the element, then focus it.
        $timeout(function () {
          element[0].focus();
        }, 0);
      },
    };
  }
})();