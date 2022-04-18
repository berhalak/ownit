export interface Observable<T = any> extends Owner {
  get(): T;
  set(value: T): void;
  peek(): T;
  map<R>(fun: MapFunc<T, R>): Computed<R>;
  subscribe(fun: SubFunction<T>): Inform;
  compare(comp: Comparator<T>): void;
}

type SubFunction<T = any> = (current: T, previous: T) => unknown;
type MapFunc<T, R> = (value: T) => R;
type Handler<T> = (value: T) => unknown;
type Inform = () => unknown;
export type Func<R> = () => R;
export type ComputedFunc<R> = Func<R> | ((owner: Owner) => R)
type Comparator<T> = (previous: T, current:T) => boolean;

export function log(msg: string, ...args: any[]) {
  if (log.active) {
    console.warn(msg, ...args);
  }
}

log.active = false;

export interface Computed<T = any> extends Observable<T> {
  onWrite(fun: Handler<T>): void;
  eval(): void;
}

type CanDispose = Inform | { dispose(): unknown };

export function dispose(value: CanDispose) {
  if (typeof value === 'function') value();
  else value.dispose();
}


export class Owner {
  public dispose() {
    const self = this as any;
    if (self._isDisposed) return;
    self._isDisposed = true;
    if (!self._pointers) return;
    for (const pointer of self._pointers) {
      dispose(pointer);
    }
    self._pointers!.splice(0, self._pointers!.length);
  }
  public owns<T extends CanDispose>(pointer: T): T {
    const self = this as any;
    if (self._isDisposed) throw new Error('Already disposed');
    if (!self._pointers) self._pointers = [];
    self._pointers!.push(pointer);
    return pointer;
  }
  public isDisposed() {
    const self = this as any;
    return self._isDisposed || false;
  }
  public static remove(owner: Owner, pointer: CanDispose){
    const index = (owner as any)._pointers?.indexOf(pointer) ?? -1;
    if (index >= 0) (owner as any)._pointers.splice(index, 1);
  }
}

class GlobalOwner extends Owner {
  private list: any[] = [];
  public dispose(): void {
    for(const item of this.list){
      dispose(item);
    }
    this.list = [];
  }
  public isDisposed() {
    return false;
  }
  public owns<T extends CanDispose>(pointer: T): T {
    this.list.push(pointer);
    return pointer;
  }
}

export const globalOwner = new GlobalOwner();

interface ActionListener {
  onGet?(obs: any): void;
}

class Monitoring {
  private static listeners: ActionListener[] = [];
  static get(obs: Observable<any>) {
    if (this.listeners.length) {
      const listener = this.listeners[this.listeners.length - 1];
      listener.onGet?.(obs);
    }
  }
  static push(listener: ActionListener) {
    this.listeners.push(listener);
  }
  static pop() {
    this.listeners.pop();
  }
}

class Subscriptions {
  private static onSetStack = new Set<Observable>();
  private static listeners = new Map<Observable, Set<ComputedImpl>>();
  private static subscribers = new Map<Observable, Set<SubFunction>>();

  static delete(obs: any) {
    this.listeners.delete(obs);
    this.subscribers.delete(obs);
    for (const e of this.listeners.values()) {
      e.delete(obs);
    }
  }
  static onSet(obs: Observable<any>, prev: any, cur: any) {
    if (obs.isDisposed()) return this.delete(obs);
    if (this.onSetStack.has(obs)) {
      console.warn('Loop in observables');
      return false;
    }
    try {
      this.onSetStack.add(obs);
      if (this.listeners.has(obs)) {
        const set = this.listeners.get(obs)!;
        for (const comp of set) {
          if (comp.isDisposed()) {
            set.delete(comp);
          } else {
            comp.setDirty();
          }
        }
      }
      if (this.subscribers.has(obs)) {
        for (const comp of this.subscribers.get(obs)!) {
          comp(cur, prev);
        }
      }
      return true;
    } finally {
      this.onSetStack.delete(obs);
    }
  }
  static monitor(what: Observable, fun: ComputedFunc<any>, owner: Owner): any {
    if (what.isDisposed()) return this.delete(what);
    function onGet(obs: any) {
      Subscriptions.subscribe(obs, what);
    }
    Monitoring.push({ onGet });
    try {
      const value = fun(owner);
      return value;
    } finally {
      Monitoring.pop();
    }
  }
  static subscribe(obs: Observable, handler: any) {
    if (obs.isDisposed()) return;
    if (this.listeners.has(obs) === false) {
      this.listeners.set(obs, new Set());
    }
    this.listeners.get(obs)?.add(handler);
  }
  static remove(what: Observable<any>, fun: SubFunction<any>): void {
    if (this.subscribers.has(what) === true) {
      this.subscribers.get(what)?.delete(fun);
    }
  }
  static add(what: Observable<any>, fun: SubFunction<any>) {
    if (what.isDisposed()) return;
    if (this.subscribers.has(what) === false) {
      this.subscribers.set(what, new Set());
    }
    this.subscribers.get(what)?.add(fun);
  }
}

export class ObservableImpl<T> extends Owner implements Observable<T> {
  constructor(
    public owner: Owner | null,
    public value: T,
    private _compare?: Comparator<T>
  ) {
    super();
    owner?.owns(this);
    if (!owner) {
      globalOwner.owns(this);
    }
  }
  get(): T {
    log((this as any).name!, 'get', this.value);
    Monitoring.get(this);
    return this.value;
  }
  set(value: T): void {
    const prev = this.value;
    const cur = value;
    if (this._compare) {
      if (this._compare(prev, cur)) {
        return;
      }
    } else if (prev === cur) {
      return;
    }
    this.value = cur;
    log((this as any).name!, 'set', cur);
    if (!Subscriptions.onSet(this, prev, cur)) {
      this.value = prev;
      log((this as any).name!, 'rewind', prev);
    }
  }
  peek(): T {
    return this.value;
  }
  map<R>(fun: MapFunc<T, R>): Computed<R> {
    return computed(this.owner, () => fun(this.get()));
  }
  subscribe(fun: SubFunction<T>): Inform {
    Subscriptions.add(this, fun);
    return () => Subscriptions.remove(this, fun);
  }
  public compare(comp: Comparator<T>): void {
    this._compare = comp;
  }
  public dispose(): void {
    super.dispose();
    Subscriptions.delete(this);
  }
}

let TRANSACTION_COUNT = 0;
const IN_TRANSACTIONS = new Set() as Set<ComputedImpl<any>>;

export class ComputedImpl<T = any> extends ObservableImpl<T> implements Computed<T> {
  private _onSet?: Handler<T>;
  private _isDirty = false;
  private _tempOwner = this.owns(new Owner());
  constructor(owner: Owner | null, private fun: ComputedFunc<T>, private _options?: { pure?: boolean}) {
    super(owner, undefined as any);
    this.setDirty();
  }
  onWrite(fun: Handler<T>): void {
    this._onSet = fun;
  }
  set(value: T) {
    if (this._onSet) this._onSet(value);
    else throw new Error("Computed is not writable");
  }
  get() {
    if (this._isDirty) {
      this._isDirty = false;
      IN_TRANSACTIONS.delete(this);
      this.eval();
    }
    return super.get();
  }
  eval() {
    this._tempOwner.dispose();
    Owner.remove(this, this._tempOwner);
    this._tempOwner = this.owns(new Owner());
    this.write(Subscriptions.monitor(this, this.fun, this._tempOwner));
  }
  setDirty() {
    if (this.isPure()) {
      if (TRANSACTION_COUNT) {
        IN_TRANSACTIONS.add(this);
      }
      this._isDirty = true;
      return;
    }
    this.eval();
  }
  write(value: T) {
    super.set(value);
  }
  private isPure() {
    return TRANSACTION_COUNT > 0 || this._options?.pure;
  }
}

export function observable<T>(owner: Owner | null, value: T): Observable<T> {
  return new ObservableImpl(owner, value);
}

export function nobservable<T>(
  name: string,
  owner: Owner | null,
  value: T
): Observable<T> {
  const obs = new ObservableImpl(owner, value);
  (obs as any).name = name;
  return obs;
}
export function computed<T>(owner: Owner | null, fun: ComputedFunc<T>): Computed<T>
export function computed<T>(owner: Owner | null, fun: ComputedFunc<T>, write: Handler<T>): Computed<T>
export function computed<T>(owner: Owner | null, fun: ComputedFunc<T>, write?: Handler<T>): Computed<T> {
  const comp = new ComputedImpl(owner, fun);
  if (write) comp.onWrite(write);
  return comp;
}

export function pure<T>(owner: Owner|null, fun: ComputedFunc<T>): Computed<T> {
  return new ComputedImpl(owner, fun, { pure: true });
}

export function ncomputed<T>(
  name: string,
  owner: Owner | null,
  fun: ComputedFunc<T>
): Computed<T> {
  const comp = new ComputedImpl(owner, fun);
  Object.assign(comp, { name });
  return comp;
}

export function bundleChanges<T>(method: () => T): T {
  TRANSACTION_COUNT++;
  try {
    return method();
  } finally {
    TRANSACTION_COUNT--;
    if (TRANSACTION_COUNT === 0) {
      const list = Array.from(IN_TRANSACTIONS);
      IN_TRANSACTIONS.clear();
      list.forEach(c => c.get());
    }
  }
}
