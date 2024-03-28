const express = require("express");
const { generateSlug } = require("random-word-slugs");
const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");
const Redis = require('ioredis');
const { Server } = require('socket.io');

const app = express();
const PORT = 9000;

app.use(express.json());
const subscriber = new Redis(
  "your redis url"
);

const ecsClient = new ECSClient({
  region: "ap-south-1",
  credentials: {
    accessKeyId: "",
    secretAccessKey: "",
  },
});

const config = {
  CLUSTER: "arn:aws:ecs:ap-south-1:610961257518:cluster/builder-server-cluster",
  TASK: "arn:aws:ecs:ap-south-1:610961257518:task-definition/builder-task",
};

const io = new Server({cors : '*'});

io.on('connection', socket => {
  socket.on('subscribe', channel => {
      socket.join(channel)
      socket.emit('message', `Joined ${channel}`)
  })
})

io.listen(9002, () => console.log('Socket server running on 9002'));





app.post("/project", async (req, res) => {
  const { gitURL, slug } = req.body;
  const projectSlug = slug ? slug : generateSlug();
  // Spin the container
  const command = new RunTaskCommand({
    cluster: config.CLUSTER,
    taskDefinition: config.TASK,
    launchType: "FARGATE",
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp : "ENABLED",
        subnets: [
          "subnet-0725a0dbc5799fdaa",
          "subnet-0788d2e35c7fe66e7",
          "subnet-0924d8250701c1fa8",
        ],
        securityGroups : ['sg-042e6c38bace68052']
      },
    },
    overrides : {
        containerOverrides : [
            {
                name : 'builder-image',
                environment : [
                    { name : 'GIT_REPOSITORY__URL', value : gitURL },
                    { name : 'PROJECT_ID', value : projectSlug }
                ]
            }
        ]
    }
  });
  await ecsClient.send(command);
  return res.json({ status : 'queued', data : { projectSlug, url : `http://${projectSlug}.localhost:8000` }})
});

async function initRedisSubscribe() {
  console.log('Subscribed to logs....')
  subscriber.psubscribe('logs:*')
  subscriber.on('pmessage', (pattern, channel, message) => {
      io.to(channel).emit('message', message)
  })
}


initRedisSubscribe()

app.listen(PORT, () => {
  console.log(`API Server is listening on ${PORT}......`);
});
