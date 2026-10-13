"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 把一段页面状态存进浏览器的 sessionStorage。
 *
 * 为什么需要它：简历定制页面里的输入（选中的 JD、手改过的草稿、其他经历）
 * 原本只是页面自己的临时状态，一离开这个页面组件就被销毁，填过的东西全没了。
 * 存到 sessionStorage 之后，切到别的页面再回来、按 F5 刷新，内容都还在；
 * 关掉标签页则自动清除。
 *
 * 为什么不用"挂载后 setState 填值"那种常见写法：
 * 一是在 effect 里同步 setState 会触发多余的二次渲染（lint 也会拦），
 * 二是那样写首屏和服务端渲染的结果对不上，页面会报错。
 * useSyncExternalStore 正是为这种"数据存在 React 之外"的场景设计的：
 * 它分别提供"浏览器上怎么读"和"服务端上怎么读"两个版本，由 React 负责衔接。
 *
 * 代价：打开页面的一瞬间先显示初始值，随后立刻换成存下来的值，会有一次空闪。
 * 这是服务端渲染加本地存储的固有代价，不是 bug。
 */

/**
 * sessionStorage 的简易订阅机制。
 * useSyncExternalStore 需要外部数据源在变化时通知 React 重新读取，所以写入后手动通知一次。
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

/**
 * 读回来的值用 JSON 存，所以只适合字符串、数字、布尔、null 这些简单值。
 * 如果以后要存对象或数组，注意每次读出来都是新引用，不能直接用作 effect 的依赖。
 */
export function useSessionState<T>(key: string, initial: T) {
  const fallback = JSON.stringify(initial);

  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        // 服务端没有 sessionStorage，这里只会在浏览器上执行。
        const stored = window.sessionStorage.getItem(key);
        return stored === null ? fallback : stored;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );

  const setValue = useCallback(
    (next: T) => {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        // 隐私模式或超出配额，忽略；页面照常能用，只是失去"刷新还在"这个特性。
      }
      notify();
    },
    [key],
  );

  return [JSON.parse(raw) as T, setValue] as const;
}
