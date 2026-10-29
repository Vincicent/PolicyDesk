import { Pipe, PipeTransform } from '@angular/core';
import { RequestType } from '../core/models';

const LABELS: Record<RequestType, string> = {
  fund_switch: 'Fund switch',
  partial_surrender: 'Partial surrender',
  extra_premium: 'Extra premium',
};

/** {{ request.type | requestType }} — the AngularJS `requestType` filter, as an Angular pipe. */
@Pipe({ name: 'requestType' })
export class RequestTypePipe implements PipeTransform {
  transform(type: RequestType): string {
    return LABELS[type] ?? type;
  }
}
