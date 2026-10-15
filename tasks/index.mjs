import * as smoke from './smoke.mjs'
import * as multiFile from './multi-file.mjs'
import * as bugfix from './bugfix.mjs'
import * as subagents from './subagents.mjs'

export const tasks = {
  smoke,
  'multi-file': multiFile,
  bugfix,
  subagents,
}
