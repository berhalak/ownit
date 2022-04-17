import { computed, globalOwner } from './index';
import { obsArray, obsJson, obsSet } from './lib';

afterAll(() => globalOwner.dispose());

test('obsArray', () => {
  const list = obsArray(null, [1, 2, 3]);
  const first = computed(null, () => list.get(0));
  expect(list.get()).toStrictEqual([1, 2, 3]);
  expect(list.get(0)).toBe(1);
  list.set(0, 2);
  expect(list.get(0)).toBe(2);
  expect(first.get()).toBe(2);
  expect(list.length()).toBe(3);
  list.push(4);
  expect(list.get()).toStrictEqual([2, 2, 3, 4]);
  expect(list.length()).toBe(4);
});

test('obsArray is called only once', () => {
  const list = obsArray(null, [1, 2, 3]);
  let counter = 0;
  const first = computed(null, () => {
    counter++;
    return list.get(0);
  });
  expect(counter).toBe(1);
  list.set(1, 10);
  expect(counter).toBe(1);
  list.set(2, 10);
  expect(counter).toBe(1);
  list.push(5);
  expect(counter).toBe(1);
  list.set(0, 5);
  expect(counter).toBe(2);
});

test('obsSet', () => {
  const set = obsSet(null);
  const hasA = computed(null, () => set.has('a'));
  set.add('a');
  expect(hasA.get()).toBe(true);
  const hasB = computed(null, () => set.has('b'));
  expect(hasB.get()).toBe(false);
  set.add('b');
  expect(hasB.get()).toBe(true);
  set.clear();
  expect(hasB.get()).toBe(false);
  expect(hasA.get()).toBe(false);
});


test('obsJson', () => {
  const json = obsJson(null, { foo: 1, bar: 2 });
  expect(json.get()).toStrictEqual({foo: 1, bar: 2});
  json.set('foo', 10);
  expect(json.get('foo')).toBe(10);
  expect(json.get('bar')).toBe(2);
  expect(json.has('foo')).toBeTruthy();
  expect(json.get()).toStrictEqual({foo: 10, bar: 2});
  expect(json.keys()).toStrictEqual(Object.keys({foo: 10, bar: 2}));

  let counter = 0;
  const foo = computed(null, () => { counter++; return json.get('foo'); });
  expect(foo.get()).toBe(10);
  expect(counter).toBe(1);
  json.set('bar', 33);
  expect(foo.get()).toBe(10);
  expect(counter).toBe(1);
  json.set('foo', 23);
  expect(foo.get()).toBe(23);
  expect(counter).toBe(2);
  json.set({foo: 9, bar: 4});
  
  expect(foo.get()).toBe(9);
  expect(counter).toBe(3);
});