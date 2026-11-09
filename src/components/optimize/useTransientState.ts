"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 把一段页面状态存在**页面内存**里，只在这一次打开网页的过程中有效。
 *
 * 需求是这样的：
 * - 跳到别的页面再回来 → 填过的东西还在；
 * - **按 F5 刷新 → 清空**；
 * - 关掉标签页再打开 → 也是空的。
 *
 * 为什么不用 sessionStorage / localStorage：那两个都扛得住刷新，跟"刷新即清空"正好相反。
 * 也不能用 React 的 useState：那个一离开页面组件就被销毁，跳到别的页面再回来就没了。
 *
 * 所以用模块级的 Map：它跟着 JS 模块活。
 * 站内路由切换不会重新加载模块，所以东西还在；
 * 刷新页面会让浏览器重新加载模块，Map 自然回到空的。
 *
 * 为什么用 useSyncExternalStore 而不是"挂载后在 effect 里 setState 填值"：
 * 一是在 effect 里同步 setState 会触发多余的二次渲染（lint 也会拦），
 * 二是那样写首屏和服务端渲染的结果对不上，React 会报错。
 * 这个 hook 对外只提供"浏览器上怎么读"和"服务端上怎么读"两个快照，
 * 两边读的都是同一份内存，所以不会出现水合不一致，也没有首屏空闪。
 *
 * 读回来的值用 JSON 存，所以只适合字符串、数字、布尔、null 这些简单值。
 */

/** 页面内存里的临时存储。刷新页面时模块重新加载，拿到的是一个空的 Map。 */
const memory = new Map<string, string>();

/**
 * useSyncExternalStore 的订阅机制。
 * 这个 hook 的数据存在 React 之外，写入之后要主动通知一次，React 才会重新读。
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export function useTransientState<T>(key: string, initial: T) {
  const fallback = JSON.stringify(initial);

  const raw = useSyncExternalStore(
    subscribe,
    () => memory.get(key) ?? fallback,
    // 服务端没有这块内存，统一按初始值渲染，所以两边结果一致。
    () => fallback,
  );

  const setValue = useCallback(
    (next: T) => {
      memory.set(key, JSON.stringify(next));
      notify();
    },
    [key],
  );

  return [JSON.parse(raw) as T, setValue] as const;
}
