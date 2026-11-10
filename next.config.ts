import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 部署平台只支持静态文件或 Python 服务，不支持 Node/Next 服务端。
   * 这里导出纯静态站点，由 deployment/app.py 托管，AI 请求再经它代理。
   */
  output: "export",

  /** 让 /resume 这类路径落成 /resume/index.html，静态服务器不用额外配置。 */
  trailingSlash: true,

  /** 静态导出没有图片优化服务。项目目前没用到 next/image，留着防止以后踩坑。 */
  images: { unoptimized: true },
};

export default nextConfig;
