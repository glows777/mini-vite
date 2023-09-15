const http = require('node:http')

const server = http.createServer()

server.listen(5173, () => console.log('listening http://localhost:5173'))

server.on('request', () => {
  console.log('hello world')
})

console.lg('end')
