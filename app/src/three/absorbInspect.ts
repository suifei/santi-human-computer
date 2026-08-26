/**
 * Vite `inspectAttr` / 点击跳源会给 JSX 注入 `code-path`。
 * R3F 把它当成虚线属性 `object.code.path`：首次挂载把 `code` 写成字符串后，
 * `commitUpdate` 再写 `path` 就会抛 "Cannot set code-path" 并拆掉 WebGL。
 */
import * as THREE from 'three';

function absorbInspectProps(proto: object) {
  if (Object.prototype.hasOwnProperty.call(proto, 'code')) return;
  const bags = new WeakMap<object, { path: string }>();
  Object.defineProperty(proto, 'code', {
    configurable: true,
    enumerable: false,
    get(this: object) {
      let bag = bags.get(this);
      if (!bag) {
        bag = { path: '' };
        bags.set(this, bag);
      }
      return bag;
    },
    set(this: object, value: unknown) {
      if (value && typeof value === 'object') {
        bags.set(this, value as { path: string });
        return;
      }
      let bag = bags.get(this);
      if (!bag) {
        bag = { path: '' };
        bags.set(this, bag);
      }
      bag.path = value == null ? '' : String(value);
    },
  });
  Object.defineProperty(proto, 'code-path', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: '',
  });
}

absorbInspectProps(THREE.EventDispatcher.prototype);
absorbInspectProps(THREE.Object3D.prototype);
absorbInspectProps(THREE.Material.prototype);
absorbInspectProps(THREE.BufferGeometry.prototype);
