// Frozen pre-migration API: changes must remain assignable in both directions.
import type * as Old from './legacy/text.js';
import type * as New from 'wakachi/text';
declare let oldValues: typeof Old;
declare let newValues: typeof New;
oldValues = newValues;
newValues = oldValues;
declare let old0: Old.Bunsetsu;
declare let new0: New.Bunsetsu;
old0 = new0;
new0 = old0;
declare let old1: Old.RubySegment;
declare let new1: New.RubySegment;
old1 = new1;
new1 = old1;
