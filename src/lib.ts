import { Computed, computed, ComputedImpl, observable, Observable, ObservableImpl, Owner, ComputedFunc } from './observables';

/**
 * Computed observable that can have its own local state before refresh.
 */
export function reactive<T>(owner: Owner|null, fun:ComputedFunc<T>): Computed<T> {
  const comp = new ComputedImpl(owner, fun);
  comp.onWrite(val => comp.write(val));
  return comp;
}


export interface ObsArray<T = any> extends Observable<T[]> {
  get(): T[];
  get(index: number): T|undefined;
  set(value: T[]): void;
  set(index: number, value: T): void;
  push(...items: T[]): void;
  length(): number;
  splice(start: number, count: number, ...items: T[]): void;
  splice(start: number, count: number): void;
  splice(start: number): void;
}

class ObservableArrayImpl<T>
  extends ObservableImpl<T[]>
  implements ObsArray<T>
{
  public _length: Observable<number>;
  private elements: Observable<T>[] = [];
  constructor(owner: Owner | null, value: T[]) {
    super(owner, value);
    this._length = reactive(this, () => this.get().length);
  }
  length(): number {
    return this._length.get();
  }
  push(...items: T[]) {
    this.set(this.get().concat(...items));
  }
  splice(start: number, count?: number, ...items: T[]) {
    const list = this.get().slice();
    list.splice(start, count as any, ...items);
    this.set(list);
  }
  get() : T[]
  get(index: number): T | undefined
  get(index?: number): T | undefined | T[] {
    if (arguments.length === 0) {
      return super.get();
    }
    for(let i = this.elements.length; i <= index!; i++) {
      this.elements.push(this.build(i));
    }
    return this.elements[index!].get();
  }
  set(value: T[]): void
  set(index: number, value: T): void
  set(...args: any[]) {
    if (arguments.length === 1) return super.set(args[0]);
    this.splice(args[0], 1, args[1]);
  }
  private build(index: number) {
    return computed(
      this,
      () => {
        return this.get()[index];
      },
      (val) => {
        this.splice(index, 1, val);
      }
    );
  }
}

export function obsArray<T = any>(
  owner: Owner | null,
  value: T[]
): ObsArray<T> {
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
  private keys = new Map<K, Computed<boolean>>();
  private _size = observable(this, 0);
  constructor(owner: Owner|null, value: Set<K>) {
    super(owner, value);
    this._size.set(value.size);
  }
  add(value: K): this {
    this.get().add(value);
    this.build(value);
    this.keys.get(value)?.set(true);
    this._size.set(this.get().size);
    return this;
  }
  clear(): void {
    this.get().clear();
    this.keys.forEach(val => val.set(false));
    this._size.set(0);
  }
  delete(value: K): boolean {
    if (this.keys.has(value)) {
      this.keys.get(value)?.set(false);
      this._size.set(this._size.get() - 1);
      return true;
    }
    return false;
  }
  has(value: K): boolean {
    this.build(value);
    return this.keys.get(value)!.get();
  }
  size(): number {
    return this._size.get();
  }
  build(key: K) {
    if (this.keys.has(key)) return;
    this.keys.set(key, reactive(this, () => this.get().has(key)));
  }
}

export function obsSet<T=any>(owner: Owner|null, value?: Set<T>): ObsSet<T> {
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
  constructor(owner: Owner|null, value: T) {
    super(owner, value);
  }
  has(key: keyof T): boolean {
    if (!this._hasMap.has(key)) {
      this._hasMap.set(key, computed(this, () => key in this.get()));
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
  get(): T
  get(...args: any[]): any {
    if (args.length === 0) return super.get();
    const key: keyof T = args[0];
    if (!this._getMap.has(key)) {
      this._getMap.set(key, computed(this, () => this.get()[key]));
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

export function obsJson<T = any>(owner: Owner|null, value: T): ObsJson<T> {
  return new ObsJsonImpl(owner, value);
}