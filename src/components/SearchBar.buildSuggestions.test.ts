import { describe, it, expect } from 'vitest';
import { buildSuggestions } from './SearchBar';

const rooms = ['Wohnzimmer', 'Küche', 'Bad Oben'];
const fns = ['Licht', 'Heizung'];
const roles = ['switch', 'value.temperature'];
const ids = ['hm-rpc.0.ABC.STATE', 'sonoff.0.plug1', 'javascript.0.script'];

describe('buildSuggestions filter values', () => {
  it('room: empty query → all rooms', () => {
    const s = buildSuggestions('room:', rooms, fns, roles, ids);
    expect(s.map((x) => x.display)).toEqual(rooms);
  });

  it('room: quotes names with spaces', () => {
    const s = buildSuggestions('room:bad', rooms, fns, roles, ids);
    expect(s).toEqual([{ display: 'Bad Oben', insert: 'room:"Bad Oben"' }]);
  });

  it('function: empty query → all functions', () => {
    const s = buildSuggestions('function:', rooms, fns, roles, ids);
    expect(s.map((x) => x.display)).toEqual(fns);
  });

  it('type: filters object types', () => {
    const s = buildSuggestions('type:chan', rooms, fns, roles, ids);
    expect(s.map((x) => x.display)).toEqual(['channel']);
  });

  it('role: filters roles', () => {
    const s = buildSuggestions('role:temp', rooms, fns, roles, ids);
    expect(s.map((x) => x.insert)).toEqual(['role:value.temperature']);
  });

  it('id: empty query → object IDs, autoSubmit, id: prefix kept', () => {
    const s = buildSuggestions('id:', rooms, fns, roles, ids);
    expect(s[0]).toEqual({ display: ids[0], insert: `id:${ids[0]}`, autoSubmit: true });
    expect(s).toHaveLength(ids.length);
  });

  it('id: filters and ranks startsWith before contains', () => {
    const s = buildSuggestions('id:sonoff', rooms, fns, roles, ids);
    expect(s.map((x) => x.display)).toEqual(['sonoff.0.plug1']);
  });

  it('empty token → all filter prefixes', () => {
    const s = buildSuggestions('', rooms, fns, roles, ids);
    expect(s.map((x) => x.insert)).toEqual(['room:', 'function:', 'type:', 'role:', 'id:', 'name:', 'desc:']);
  });

  it('bareIdSuggest=false suppresses plain-token ID suggestions', () => {
    expect(buildSuggestions('sonoff', rooms, fns, roles, ids, false)).toEqual([]);
    // but id: prefix still works
    expect(buildSuggestions('id:sonoff', rooms, fns, roles, ids, false)).toHaveLength(1);
  });
});
