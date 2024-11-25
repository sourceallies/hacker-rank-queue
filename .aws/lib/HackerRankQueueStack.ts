import {
  aws_certificatemanager as acm,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecs_patterns as ecsPatterns,
  aws_iam as iam,
  aws_route53 as route53,
  CfnOutput,
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

interface HackerRankQueueStackProps extends StackProps {
  mode: 'dev' | 'prod';
  hostedZone: string;
  image: string;
  environment: {
    SPREADSHEET_ID: string;
    INTERVIEWING_CHANNEL_ID: string;
    ERRORS_CHANNEL_ID: string;
    REQUEST_EXPIRATION_MIN: string;
    ENCRYPTED_SLACK_BOT_TOKEN: string;
    ENCRYPTED_SLACK_SIGNING_SECRET: string;
    ENCRYPTED_GOOGLE_PRIVATE_KEY: string;
    ENCRYPTED_GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
    WORKDAY_START_HOUR: string;
    WORKDAY_END_HOUR: string;
    HACK_PARSER_BUCKET_NAME: string;
    HACK_PARSER_URL_GENERATOR_FUNCTION_NAME: string;
    TZ: string;
    NUMBER_OF_INITIAL_REVIEWERS: string;
  };
}

export class HackerRankQueueStack extends Stack {
  constructor(scope: Construct, id: string, props: HackerRankQueueStackProps) {
    super(scope, id, props);
    // Cluster Config
    const customVpc = new ec2.Vpc(this, 'VPC', {});
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: customVpc,
      capacity: {
        instanceType: new ec2.InstanceType('t2.micro'),
      },
    });
    new CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
      description: 'The name of the ECS cluster the bot is running in',
    });

    const domainName = `hacker-rank-queue.${props.hostedZone}`;
    const domainZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: props.hostedZone,
    });

    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName,
      validation: acm.CertificateValidation.fromDns(domainZone),
    });

    const fargate = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Bot', {
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry(props.image),
        environment: {
          ...props.environment,
          PORT: '3000',
          MODE: props.mode,
        },
        containerPort: 3000,
      },
      cluster,
      cpu: 256,
      certificate,
      memoryLimitMiB: 512,
      publicLoadBalancer: true,
      circuitBreaker: {
        rollback: true,
      },
      domainName,
      domainZone,
    });

    const decryptPolicy = iam.ManagedPolicy.fromManagedPolicyName(
      this,
      'PipelineKeyDecryptPolicy',
      'PipelineKeyDecrypt',
    );
    fargate.taskDefinition.taskRole.addManagedPolicy(decryptPolicy);

    fargate.targetGroup.configureHealthCheck({
      enabled: true,
      path: '/api/health',
      healthyHttpCodes: '204',
    });
    if (props.mode === 'dev') {
      fargate.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '10');
    }
    new CfnOutput(this, 'ServiceName', {
      value: fargate.service.serviceName,
      description: 'The name of the ECS service the bot is running in',
    });
  }
}
