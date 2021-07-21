import * as cdk from '@aws-cdk/core';
import * as secretsManager from '@aws-cdk/aws-secretsmanager';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecr from '@aws-cdk/aws-ecr';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecsPatterns from '@aws-cdk/aws-ecs-patterns';
import * as route53 from '@aws-cdk/aws-route53';

interface HackerRankQueueStackProps extends cdk.StackProps {
  mode: 'dev' | 'prod';
  hostedZone: string;
  environment: {
    SPREADSHEET_ID: string;
    INTERVIEWING_CHANNEL_ID: string;
  };
}

export class HackerRankQueueStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: HackerRankQueueStackProps) {
    super(scope, id, props);

    // Get secrets
    const credentials = secretsManager.Secret.fromSecretNameV2(
      this,
      'Credentials',
      'hacker-rank-queue/credentials',
    );
    const SLACK_BOT_TOKEN = ecs.Secret.fromSecretsManager(credentials, 'SLACK_BOT_TOKEN');
    const SLACK_SIGNING_SECRET = ecs.Secret.fromSecretsManager(credentials, 'SLACK_SIGNING_SECRET');
    const GOOGLE_PRIVATE_KEY = ecs.Secret.fromSecretsManager(credentials, 'GOOGLE_PRIVATE_KEY');
    const GOOGLE_SERVICE_ACCOUNT_EMAIL = ecs.Secret.fromSecretsManager(
      credentials,
      'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    );

    // Cluster Config
    const customVpc = new ec2.Vpc(this, 'VPC', {});
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: customVpc,
      capacity: {
        instanceType: new ec2.InstanceType('t2.micro'),
      },
    });
    new cdk.CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
      description: 'The name of the ECS cluster the bot is running in',
    });

    const domainZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: props.hostedZone,
    });
    const fargate = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Bot', {
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(
          ecr.Repository.fromRepositoryName(this, 'ImageSource', 'sai/hacker-rank-queue'),
          props.mode,
        ),
        environment: {
          ...props.environment,
          PORT: '3000',
          MODE: props.mode,
        },
        secrets: {
          SLACK_BOT_TOKEN,
          SLACK_SIGNING_SECRET,
          GOOGLE_PRIVATE_KEY,
          GOOGLE_SERVICE_ACCOUNT_EMAIL,
        },
        containerPort: 3000,
      },
      cluster,
      cpu: 256,
      memoryLimitMiB: 512,
      publicLoadBalancer: true,
      circuitBreaker: {
        rollback: true,
      },
      domainName: `hacker-rank-queue.${props.hostedZone}`,
      domainZone,
    });
    fargate.targetGroup.configureHealthCheck({
      enabled: true,
      path: '/api/health',
      healthyHttpCodes: '204',
    });
    if (props.mode === 'dev') {
      fargate.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '10');
    }
    new cdk.CfnOutput(this, 'ServiceName', {
      value: fargate.service.serviceName,
      description: 'The name of the ECS service the bot is running in',
    });
  }
}
