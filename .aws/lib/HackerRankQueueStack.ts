import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecsPatterns from '@aws-cdk/aws-ecs-patterns';
import * as route53 from '@aws-cdk/aws-route53';
import * as cdk from '@aws-cdk/core';
import { create } from 'tar';
import { Kaniko } from './KanikoStack';
import { createWriteStream } from 'fs';
import { Asset } from '@aws-cdk/aws-s3-assets';

interface HackerRankQueueStackProps extends cdk.StackProps {
  mode: 'dev' | 'prod';
  hostedZone: string;
  environment: {
    SPREADSHEET_ID: string;
    INTERVIEWING_CHANNEL_ID: string;
    ERRORS_CHANNEL_ID: string;
    REQUEST_EXPIRATION_MIN: string;
    ENCRYPTED_SLACK_BOT_TOKEN: string;
    ENCRYPTED_SLACK_SIGNING_SECRET: string;
    ENCRYPTED_GOOGLE_PRIVATE_KEY: string;
    ENCRYPTED_GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  };
}

export class HackerRankQueueStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: HackerRankQueueStackProps) {
    super(scope, id, props);
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

    const image = this.createDockerImage();
    const fargate = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Bot', {
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(image.destinationRepository),
        environment: {
          ...props.environment,
          PORT: '3000',
          MODE: props.mode,
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

    const decryptPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName('PipelineKeyDecrypt');
    fargate.taskDefinition.taskRole.addManagedPolicy(decryptPolicy);
    image.destinationRepository.grantPull(fargate.taskDefinition.taskRole);

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

  private createDockerImage(): Kaniko {
    const context = this.createDockerContext();
    const image = new Kaniko(this, 'HackerRankQueueImage', {
      context: context.s3ObjectUrl,
    });

    image.buildImage();
    return image;
  }

  private createDockerContext(): Asset {
    const path = 'bin/hackerRankQueue.tar.gz';
    const tarball = create(
      {
        cwd: '..',
        gzip: true,
        filter: path => !path.includes('node_modules'),
      },
      ['.'],
    );
    const tarballDestination = createWriteStream(path);
    tarball.pipe(tarballDestination);

    return new Asset(this, 'ContainerImageContext', {
      path,
    });
  }
}
