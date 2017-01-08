/**
 * Server for creating the docker container and receiving the Socket.io requests.
 * 
 * @author André Ferreira <andrehrf@gmail.com>
 * @license MIT
 */

let argv = require('optimist').argv
    fs = require("fs"),
    express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io')(server),
    ss = require('socket.io-stream'),
    Docker = require('dockerode');
    
let previousKey, CTRL_P = '\u0010', CTRL_Q = '\u0011';

//Settings
let dockerRemoteAPIHost = argv.host || "127.0.0.1",
    dockerRemoteAPIPort = argv.port || 2375,
    dockerContainerImage = argv.image || "ubuntu",
    dockerContainerName = argv.name || "docker-terminal",
    serverPort = argv.serverport || 3000;
   
var docker = new Docker({host: dockerRemoteAPIHost, port: dockerRemoteAPIPort});
let container = null;

docker.listContainers(function (err, containers) {
    for(let key in containers){
        if(containers[key].Names[0] === "/" + dockerContainerName){
            container = docker.getContainer(containers[key].Id);
            headlerContainer(container);
            break;
        }
    }
        
    setTimeout(function(){
        if(!container){
            docker.createContainer({Image: dockerContainerImage, name: dockerContainerName, Cmd: '/bin/bash', OpenStdin: true, Tty: true}, function(err, container) {
                if(err) console.log(err);
                else{ 
                    container.start(function (err, data) {
                        if(err){
                            console.log(err);
                            io.sockets.emit("error", err);
                        }
                        else{
                            console.log("Start container");
                        }
                    });

                    headlerContainer(container);
                }
            });
        }
    }, 1000);
});

function headlerContainer(container){
    container.attach({stream: true, stdout: true, stdin: true, stderr: true, AttachStdin: true, AttachStdout: true, AttachStderr: true, OpenStdin: false, StdinOnce: false, Tty: true}, function (err, stream) {
        if(err){ 
            console.log(err);
            io.sockets.emit("error", err);
        }
        else{
            io.on('connection', function(socket){ 
                console.log("user connect: "+socket.id);

                if(err) {
                    console.log(err);
                    socket.emit("stderr", err);
                }
                else{                        
                    socket.on('stdin', function (data) {
                        container.exec({Cmd: data.split(" "), AttachStdin: true, AttachStdout: true}, function(err, exec) {
                            exec.start({hijack: true, stdin: true}, function(err, stream) {
                                stream.on('data', function(chunk) {
                                    io.sockets.emit("stdout", chunk.toString());
                                    console.log(chunk.toString());
                                });

                                stream.on('error', function(err) {
                                    io.sockets.emit("stderr", err.toString());
                                    console.log(err.toString());
                                });

                                stream.on('end', function(chunk) {
                                    io.sockets.emit("enable");
                                });

                                docker.modem.demuxStream(stream, process.stdout, process.stderr);
                            });
                        });
                    });

                    stream.pipe(process.stdout);
                }
            });
        }
    }); 

    /*process.on('SIGINT', (code) => {
        container.remove(function (err, data) {
            console.log(data);
            process.exit(0);
        });
    });

    process.on('SIGKILL', (code) => {
        container.remove(function (err, data) {
            console.log(data);
            process.exit(0);
        });
    });

    process.on('exit', (code) => {
        container.remove(function (err, data) {
            process.exit(0);
        });
    });*/
}

app.use(express.static('public'));
app.get('/', function (req, res){ res.status(200).type('html').sendFile("index.html"); });
server.listen(serverPort, () => { console.log("server listen in http://localhost:" + serverPort); });