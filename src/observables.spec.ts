import { reactive } from './lib';
import { computed, Observable, observable, nobservable, ncomputed, pure, bundleChanges, Owner } from './observables'

test("works", () => {
  const one = observable(null, 1);
  const two = observable(null, 2);
  const sum = computed(null, () => one.get() + two.get());
  const times = sum.map(s => s * 2);
  one.set(2);
  expect(sum.get()).toBe(4);
  expect(times.get()).toBe(8);
  one.set(3);
  expect(times.get()).toBe(10);
});

test("pure works", () => {
  const one = observable(null, 1);
  let counter = 0;
  const double = pure(null, () => { counter++; return one.get() * 2 });
  expect(counter).toBe(0);
  one.set(2);
  expect(counter).toBe(0);
  one.set(3);
  expect(counter).toBe(0);
  expect(double.get()).toBe(6);
  expect(counter).toBe(1);
});

test("bundle works works", () => {
  const one = observable(null, 1);
  let counter = 0;
  const double = computed(null, () => { counter++; return one.get() * 2 });
  expect(counter).toBe(1);
  one.set(2);
  expect(counter).toBe(2);
  one.set(3);
  bundleChanges(() => {
    one.set(4);
    one.set(5);
    one.set(6);
  });
  expect(counter).toBe(4);
  expect(double.get()).toBe(12);
});

test("peek works", () => {
  const x = observable(null, 10);
  const c = computed(null, () => x.peek() + 2);
  expect(c.get()).toBe(12);
  x.set(20);
  expect(c.get()).toBe(12);
});

test("reactive works", () => {
  const obs = observable(null, 10);
  const rec = reactive(null, () => obs.get());
  expect(rec.get()).toBe(10);
  obs.set(20);
  expect(rec.get()).toBe(20);
  rec.set(30);
  expect(rec.get()).toBe(30);
  obs.set(40);
  expect(rec.get()).toBe(40);
});

test("doesn't fall into a loop", () => {
  const x = nobservable("x", null, 1);
  let c: Observable<number>;
  const a = ncomputed("a", null, () => x.get() + (c ? c.get() : 0));
  const b = ncomputed("b", null, () => a.get());
  c = ncomputed("c", null, () => b.get());

  let manual = a.get();
  a.subscribe((val) => manual = val);

  expect(a.get()).toBe(1);
  expect(b.get()).toBe(1);
  expect(c.get()).toBe(1);
  x.set(2);
  expect(a.get()).toBe(3);
  expect(b.get()).toBe(3);
  expect(c.get()).toBe(3);
  expect(manual).toBe(3);

  a.dispose();
  x.set(5);
  expect(a.get()).toBe(3);
  expect(b.get()).toBe(3);
  expect(c.get()).toBe(3);
  expect(manual).toBe(3);
});

test("dispose computed", () => {
  const obs = observable(null, 10);
  let counter = 0;

  const comp = computed(null, (owner) => {
    owner.owns(() => counter++);
    return obs.get();
  });
  expect(counter).toBe(0);
  obs.set(2);
  expect(counter).toBe(1);
  expect(comp.get()).toBe(2);
});


test("performence 1", () => {
  const o = new Owner();
  const obs = observable(o, 10);
  const keys = [...new Array(10000).keys()];
  const start = Date.now();
  const comps = keys.map(i => computed(o, () => obs.get() + 10));
  obs.set(20);
  expect(comps.every(c => c.get() === 30)).toBeTruthy();
  o.dispose();
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(80);
});