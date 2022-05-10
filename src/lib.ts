import {
  Computed,
  computed,
  ComputedImpl,
  observable,
  Observable,
  ObservableImpl,
  Owner,
  ComputedFunc,
  bundleChanges,
} from './observables';

/**
 * Computed observable that can have its own local state before refresh.
 */
export function reactive<T>(owner: Owner | null, fun: ComputedFunc<T>): Computed<T> {
  const comp = new ComputedImpl(owner, fun);
  comp.onWrite(val => comp.write(val));
  return comp;
}

export interface ObsArray<T = any> {
  get(): T[];
  get(index: number): T | undefined;
  set(value: T[]): void;
  set(index: number, value: T): void;
  push(...items: T[]): void;
  length(): number;
  splice(start: number, count: number, ...items: T[]): void;
  splice(start: number, count: number): void;
  splice(start: number): void;
  map<K>(mapper: (value: T) => K): ObsArray<K>;
  find(mapper: (value: T) => boolean): Observable<T | undefined>;
}

class ObservableArrayImpl<T> extends Owner implements ObsArray<T> {
  private _length: Observable<number>;
  private _items: Observable<T>[] = [];
  constructor(owner: Owner | null, value: T[]) {
    super();
    owner?.owns(this);
    this._length = observable(this, value.length);
    this._items = value.map(v => observable(this, v));
  }
  length(): number {
    return this._length.get();
  }
  push(...items: T[]) {
    bundleChanges(() => {
      for (let i = 0; i <= items.length; i++) {
        const myIndex = this.length() + i;
        this._ensure(myIndex);
        this.set(myIndex, items[i]);
      }
      this._length.set(this._length.get() + items.length);
    });
  }
  _ensure(index: number) {
    for (let i = this._length.peek(); i <= index; i++) {
      this._items.push(observable(this, undefined as any));
    }
  }
  splice(start: number, count?: number, ...items: T[]) {
    const raw = this.get();
    raw.splice(start, count ?? 0, ...items);
    this.set(raw);
  }
  get(): T[];
  get(index: number): T | undefined;
  get(index?: number): T | undefined | T[] {
    if (arguments.length === 0) {
      return this._items.slice(0, this._length.get()).map(i => i.get());
    }
    this._ensure(index!);
    return this._items[index!].get();
  }
  set(value: T[]): void;
  set(index: number, value: T): void;
  set(...args: any[]) {
    if (arguments.length === 1) {
      const value: T[] = args[0];
      bundleChanges(() => {
        for (let i = 0; i < Math.max(this._length.get(), value.length); i++) {
          this._ensure(i);
          this._items[i].set(value[i]);
        }
        this._length.set(value.length);
      });
    } else {
      const index: number = args[0];
      const value = args[1];
      bundleChanges(() => {
        this._ensure(index);
        this._items[index].set(value);
      });
    }
  }

  map<K>(mapper: (value: T) => K): ObsArray<K> {
    const raw = computed(this, () => this.get());
    const other = obsArray(this, raw.get().map(mapper));
    this.owns(raw.subscribe(val => other.set(val.map(mapper))));
    return other;
  }

  find(mapper: (value: T) => boolean): Observable<T | undefined> {
    return computed(this, () => this.get().find(mapper));
  }
}

export function obsArray<T = any>(owner: Owner | null, value: T[]): ObsArray<T> {
  return new ObservableArrayImpl(owner, value);
}

export interface ObsSet<T = any> extends Observable<Set<T>> {
  add(value: T): this;
  clear(): void;
  delete(value: T): boolean;
  has(value: T): boolean;
  size(): number;
}

class ObsSetImpl<K> extends ObservableImpl<Set<K>> implements ObsSet<K> {
  private _keys = new Map<K, Computed<boolean>>();
  private _size = observable(this, 0);
  constructor(owner: Owner | null, value: Set<K>) {
    super(owner, value);
    this._size.set(value.size);
  }
  add(value: K): this {
    this.get().add(value);
    this.build(value);
    this._keys.get(value)?.set(true);
    this._size.set(this.get().size);
    return this;
  }
  clear(): void {
    this.get().clear();
    this._keys.forEach(val => val.set(false));
    this._size.set(0);
  }
  delete(value: K): boolean {
    if (this._keys.has(value)) {
      this._keys.get(value)?.set(false);
      this._size.set(this._size.get() - 1);
      return true;
    }
    return false;
  }
  has(value: K): boolean {
    this.build(value);
    return this._keys.get(value)!.get();
  }
  size(): number {
    return this._size.get();
  }
  build(key: K) {
    if (this._keys.has(key)) return;
    this._keys.set(
      key,
      reactive(this, () => this.get().has(key))
    );
  }
}

export function obsSet<T = any>(owner: Owner | null, value?: Set<T>): ObsSet<T> {
  return new ObsSetImpl(owner, value ?? new Set());
}

export interface ObsJson<T> extends Observable<T> {
  has(key: keyof T): boolean;
  get<Z extends keyof T>(key: Z): T[Z];
  get(): T;
  set<Z extends keyof T>(key: Z, value: T[Z]): void;
  set(value: T): void;
  keys(): string[];
  values(): any[];
}

class ObsJsonImpl<T> extends ObservableImpl<T> implements ObsJson<T> {
  private _hasMap: Map<keyof T, Computed<boolean>> = new Map();
  private _getMap: Map<keyof T, Computed<any>> = new Map();
  constructor(owner: Owner | null, value: T) {
    super(owner, value);
  }
  has(key: keyof T): boolean {
    if (!this._hasMap.has(key)) {
      this._hasMap.set(
        key,
        computed(this, () => key in this.get())
      );
    }
    return this._hasMap.get(key)?.get() ?? false;
  }
  keys(): string[] {
    return Object.keys(this.get());
  }
  values(): any[] {
    return Object.values(this.get());
  }
  get<Z extends keyof T>(key: Z): T[Z];
  get(): T;
  get(...args: any[]): any {
    if (args.length === 0) return super.get();
    const key: keyof T = args[0];
    if (!this._getMap.has(key)) {
      this._getMap.set(
        key,
        computed(this, () => this.get()[key])
      );
    }
    return this._getMap.get(key)?.get();
  }
  set(key: keyof T, value: any): void;
  set(value: T): void;
  set(...args: any[]): any {
    if (args.length === 1) return super.set(args[0]);
    const key = args[0] as keyof T;
    this.get()[key] = args[1];
    if (this._getMap.has(key)) {
      this._getMap.get(key)?.eval();
    }
    if (this._hasMap.has(key)) {
      this._hasMap.get(key)?.eval();
    }
  }
}

export function obsJson<T = any>(owner: Owner | null, value: T): ObsJson<T> {
  return new ObsJsonImpl(owner, value);
}

export interface ObsMap<K = string, V = any> extends Owner {
  has(key: K): boolean;
  get(): Map<K, V>;
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  keys(): K[];
  values(): V[];
  delete(key: K): void;
  assign(value: any): void;
}

export function obsMap<K = string, V = any>(owner: Owner | null, value: any): ObsMap<K, V> {
  return new ObsMapImpl(owner, value);
}

class ObsMapImpl extends Owner implements ObsMap<any, any> {
  _map = new Map();
  _obs: Map<any, Observable<any>> = new Map();
  _version = observable(this, 0);
  constructor(owner: Owner | null, value: any) {
    super();
    owner?.owns(this);
    this.assign(value);
  }
  get(key: any): any;
  get(): Map<any, any>;
  get(key?: any): any {
    if (key === undefined) {
      return new Map([...this._map.entries()].map(e => [e[0], e[1]]));
    }
    if (!this._obs.has(key!)) {
      this._obs.set(
        key!,
        computed(this, () => {
          this._version.get();
          return this._map.get(key!);
        })
      );
    }
    return this._obs.get(key!)?.get();
  }
  has(key: any): boolean {
    return this.get(key) !== undefined;
  }
  set(key: any, value: any): void {
    this._map.set(key, value);
    this._inc();
  }
  _inc() {
    this._version.set(this._version.get() + 1);
  }
  keys(): any[] {
    this._version.get();
    return Array.from(this._map.keys());
  }
  values(): any[] {
    this._version.get();
    return Array.from(this._map.values());
  }
  delete(key: any): void {
    this._map.delete(key);
    this._inc();
  }
  assign(value: any): void {
    if (value instanceof Map) {
      for(const e of value.entries()){
        this.set(e[0], e[1]);
      }
    } else if (value && typeof value === 'object') {
      for(const key in value){
        this.set(key, value[key]);
      }
    }
  }
}
