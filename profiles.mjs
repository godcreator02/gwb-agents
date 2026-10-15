// 每个模型一份：model 传给 SDK，env 覆盖到子进程的环境变量上。
// 密钥从本机环境变量读，不写进仓里。
export const profiles = {
  claude: {
    model: 'claude-sonnet-5-5',
    env: {},
  },
}
