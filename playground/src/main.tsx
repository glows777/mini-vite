import React from 'react'
import ReactDOM from 'react-dom'

import App from './App'

// import { Test } from './Test'
import { Test2 } from './Test2'

import './index.css'

// const App = () => <div>hello world</div>
function App2() {
  return <>
        {/* <Test /> */}
        <App key='b' />
        <Test2 />
    </>
}
ReactDOM.render(<App2 />, document.getElementById('root'))

// // @ts-expect-error import.meta.hot 类型未声明
// import.meta.hot.accept(() => {
//   ReactDOM.render(<App2 />, document.getElementById('root'))
// })
