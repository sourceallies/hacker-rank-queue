import * as path from 'path';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecr from '@aws-cdk/aws-ecr';
import * as ecs from '@aws-cdk/aws-ecs';
import * as iam from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';
import { RunTask } from 'cdk-fargate-run-task';
import { Asset } from '@aws-cdk/aws-s3-assets';

export interface KanikoProps {
  /**
   * Kaniko build context.
   * @see https://github.com/GoogleContainerTools/kaniko#kaniko-build-contexts
   */
  readonly contextAsset: Asset;
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
   * The VPC to run kaniko images in.
   */
  readonly vpc: ec2.IVpc;
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

  constructor(scope: cdk.Construct, id: string, props: KanikoProps) {
    super(scope, id);

    this.vpc = props.vpc;
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
        '/kaniko/executor',
        '--context',
        props.contextAsset.s3ObjectUrl,
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

    props.contextAsset.grantRead(this.task.taskRole);
    const s3Policy = iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess');
    this.task.taskRole.addManagedPolicy(s3Policy);

    this.destinationRepository.grantPullPush(this.task.taskRole);

    new cdk.CfnOutput(this, 'Repository', {
      value: this.destinationRepository.repositoryName,
    });

    this.buildImage();
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
    const newRunTask = new RunTask(this, `BuildImage`, {
      task: this.task,
      cluster: this.cluster,
    });
    newRunTask.node.addDependency(this.vpc);
  }
}
