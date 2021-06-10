import * as cdk from '@aws-cdk/core';
import * as secretsManager from '@aws-cdk/aws-secretsmanager';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import { InstanceType } from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecsPatterns from '@aws-cdk/aws-ecs-patterns';

interface HackerRankQueueStackProps extends cdk.StackProps {
  mode: 'dev' | 'prod';
  environment: {
    SPREADSHEET_ID: string;
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
        instanceType: new InstanceType('t2.micro'),
        desiredCapacity: 1,
      },
    });

    new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Bot', {
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry('docker.io/ealen/echo-server'),
        environment: {
          ...props.environment,
          PORT: '3000',
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
      desiredCount: 1,
      publicLoadBalancer: true,
      circuitBreaker: {
        rollback: true,
      },
    });
  }
}
