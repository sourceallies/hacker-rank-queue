import * as path from 'path';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecr from '@aws-cdk/aws-ecr';
import * as ecs from '@aws-cdk/aws-ecs';
import * as cdk from '@aws-cdk/core';
import { RunTask } from 'cdk-fargate-run-task';

export interface KanikoProps {
  /**
   * Kaniko build context.
   * @see https://github.com/GoogleContainerTools/kaniko#kaniko-build-contexts
   */
  readonly context: string;
  /**
   * The target ECR repository
   * @default - create a new ECR private repository
   */
  readonly destinationRepository?: ecr.IRepository;
  /**
   * The context sub path
   *
   * @defautl - current directory
   */
  readonly contextSubPath?: string;
  /**
   * The Dockerfile for the image building
   *
   * @default Dockerfile
   */
  readonly dockerfile?: string;
}

export class Kaniko extends cdk.Construct {
  readonly destinationRepository: ecr.IRepository;
  readonly cluster: ecs.ICluster;
  readonly task: ecs.FargateTaskDefinition;
  readonly vpc: ec2.IVpc;
  private fargateSpot: boolean;
  constructor(scope: cdk.Construct, id: string, props: KanikoProps) {
    super(scope, id);

    this.vpc = getOrCreateVpc(this);
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: this.vpc,
    });

    this.destinationRepository = props.destinationRepository ?? this._createDestinationRepository();
    const executorImage = ecs.ContainerImage.fromRegistry('public.ecr.aws/eag/kaniko:latest');

    this.task = new ecs.FargateTaskDefinition(this, 'BuildImageTask', {
      cpu: 512,
      memoryLimitMiB: 1024,
    });

    this.task.addContainer('kaniko', {
      image: executorImage,
      command: [
        '--context',
        props.context,
        '--context-sub-path',
        props.contextSubPath ?? './',
        '--dockerfile',
        props.dockerfile ?? 'Dockerfile',
        '--destination',
        this.destinationRepository.repositoryUri,
        '--force',
      ],
      logging: new ecs.AwsLogDriver({ streamPrefix: 'kaniko' }),
    });

    this.destinationRepository.grantPullPush(this.task.taskRole);

    new cdk.CfnOutput(this, 'Repository', {
      value: this.destinationRepository.repositoryName,
    });
  }

  private _createDestinationRepository(): ecr.Repository {
    return new ecr.Repository(this, 'Repo', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
  /**
   * Build the image with kaniko.
   * @param schedule The schedule to repeatedly build the image
   */
  public buildImage() {
    // run it just once
    const newRunTask = new RunTask(this, `BuildImage`, {
      task: this.task,
      cluster: this.cluster,
    });
    // if vpc is a new resource in this stack, run task job will add dependency on vpc created.
    if (
      (this.node.tryFindChild('Vpc') as ec2.Vpc).node.children.find(
        c => (c as cdk.CfnResource).cfnResourceType === 'AWS::EC2::VPC',
      )
    ) {
      newRunTask.node.addDependency(this.vpc);
    }
  }
}

function getOrCreateVpc(scope: cdk.Construct): ec2.IVpc {
  // use an existing vpc or create a new one
  return scope.node.tryGetContext('use_default_vpc') === '1' ||
    process.env.CDK_USE_DEFAULT_VPC === '1'
    ? ec2.Vpc.fromLookup(scope, 'Vpc', { isDefault: true })
    : scope.node.tryGetContext('use_vpc_id')
    ? ec2.Vpc.fromLookup(scope, 'Vpc', { vpcId: scope.node.tryGetContext('use_vpc_id') })
    : new ec2.Vpc(scope, 'Vpc', { maxAzs: 3, natGateways: 1 });
}