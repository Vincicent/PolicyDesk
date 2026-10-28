// Who is signed in. The token survives a page reload (sessionStorage) but not closing the tab.
(function () {
  'use strict';

  angular.module('backoffice').factory('authService', authService);

  authService.$inject = ['$http', '$window'];
  function authService($http, $window) {
    var storage = $window.sessionStorage;
    // Parse once and keep the SAME object: a function that returns a new object on every call
    // (e.g. `return JSON.parse(...)`) makes every {{ $ctrl.user() }} watcher "change" forever → infdig error.
    var currentUser = JSON.parse(storage.getItem('user') || 'null');

    return {
      login: login,
      logout: logout,
      isSignedIn: isSignedIn,
      token: function () {
        return storage.getItem('token');
      },
      user: function () {
        return currentUser;
      },
    };

    function login(username, password) {
      return $http.post('/api/login', { username: username, password: password }).then(function (response) {
        if (response.data.user.role !== 'underwriter') {
          throw { message: 'The back-office is for underwriters. Brokers use the portal.' };
        }
        storage.setItem('token', response.data.token);
        storage.setItem('user', JSON.stringify(response.data.user));
        currentUser = response.data.user;
        return currentUser;
      });
    }

    function logout() {
      storage.removeItem('token');
      storage.removeItem('user');
      currentUser = null;
    }

    function isSignedIn() {
      return storage.getItem('token') !== null;
    }
  }
})();