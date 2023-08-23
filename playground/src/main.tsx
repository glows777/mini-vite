import React from 'react'
import ReactDOM from 'react-dom'

// import App from './App'
import './index.css'

const App = () => <div>hello world</div>
ReactDOM.render(<App />, document.getElementById('root'))

// @ts-expect-error import.meta.hot 类型未声明
import.meta.hot.accept(() => {
  ReactDOM.render(<App />, document.getElementById('root'))
})
