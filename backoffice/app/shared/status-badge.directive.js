// A directive: the pre-1.5 way to make a reusable element. <status-badge status="r.status"></status-badge>
// Since 1.5, .component() is simpler for this; you still meet directives everywhere in legacy code,
// and you still need them for DOM behaviour (attributes like autofocus, drag & drop…).
(function () {
  'use strict';

  angular.module('backoffice').directive('statusBadge', function () {
    return {
      restrict: 'E', // used as an Element (A = attribute, C = class)
      scope: { status: '<' }, // isolate scope: only sees what is passed in
      template: '<span class="badge" ng-class="status">{{ status | statusLabel }}</span>',
    };
  });
})();