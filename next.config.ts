import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * tesseract.js 不参与打包，直接在 Node 里按原路径加载。
   *
   * 它内部会用一个运行时算出来的路径去起 worker 子进程，
   * 一旦被打包，那个路径会被替换成占位符，启动时报
   * Cannot find module '/ROOT/node_modules/tesseract.js/...'。
   * 排除之后它才能找到自己的 worker 脚本。
   */
  serverExternalPackages: ["tesseract.js"],
};

export default nextConfig;
