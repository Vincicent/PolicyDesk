// Copies the AngularJS libraries into backoffice/vendor/. Legacy apps often commit their libraries like this
// (no bundler, plain <script> tags), so we do the same. Run after `npm install`: npm run vendor
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('backoffice/vendor', { recursive: true });
cpSync('node_modules/angular/angular.js', 'backoffice/vendor/angular.js');
cpSync('node_modules/@uirouter/angularjs/release/angular-ui-router.js', 'backoffice/vendor/angular-ui-router.js');
console.log('Copied angular.js and angular-ui-router.js to backoffice/vendor/');
