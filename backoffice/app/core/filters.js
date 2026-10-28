// Display filters: {{ value | filterName }}
(function () {
  'use strict';

  angular
    .module('backoffice')
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
})();