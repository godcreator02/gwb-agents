# pricing-demo

```js
import { calcTotal } from './src/index.js'

calcTotal([{ price: 10, qty: 2 }]) // 20
```

`calcTotal` 是所有金额计算的入口，购物车、发票、报表都调用它。
