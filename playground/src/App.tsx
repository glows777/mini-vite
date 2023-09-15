import React, { useState } from 'react'
import { debounce } from 'lodash'

import logo from '../public/logo.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const setCount2 = debounce(setCount)

  return (
    <div className="App">
      <header className="App-header">
        <img className="App-logo" src={logo} alt="" />
        <p>Hello m-Vite + React</p>
        <p>
          <button type="button" onClick={() => setCount2(count => count + 1)}>
            count is: {count}
          </button>
        </p>
        <p>
          Edit <code>App</code> and save a test
        </p>
        <p>
          <a
            className="App-link"
            href="https://reactjs.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn React
          </a>
          {' | '}
          <a
            className="App-link"
            href="https://vitejs.dev/guide/features.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vite Docs
          </a>
        </p>
      </header>
    </div>
  )
}

export default App
