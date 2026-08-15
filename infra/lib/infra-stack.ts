import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'

/** Aurora pauses after this long without work. Five minutes is the shortest the service allows. */
const AUTO_PAUSE = cdk.Duration.minutes(5)

/**
 * Owner of the warehouse. It is named here rather than left to a default, because the default the
 * library picks is a word Postgres reserves and the cluster would refuse it.
 */
export const WAREHOUSE_USERNAME = 'ohfootball'

/** Database the pipeline builds and the snapshot is written from. */
export const WAREHOUSE_DATABASE = 'ohfootball'

/**
 * Port the warehouse answers on. It is set rather than left to the default so that the rule
 * letting the pipeline reach it can name a number. A rule built from the endpoint of the cluster
 * carries a value nothing can check until the stack is deployed.
 */
export const WAREHOUSE_PORT = 5432

/**
 * The parts every other stack builds on: the network, the warehouse, and the buckets.
 *
 * The network carries no NAT gateway. A NAT gateway costs more per month than everything else here
 * put together, and nothing needs one. The pipeline tasks run in a public subnet and reach the
 * internet through the internet gateway, which costs nothing. The warehouse sits in an isolated
 * subnet and is reachable only from inside the network.
 */
export class InfraStack extends cdk.Stack {
  readonly vpc: ec2.Vpc
  readonly warehouse: rds.DatabaseCluster
  /** Holds the deployment package of the API and the snapshot it reads. */
  readonly artifacts: s3.Bucket
  /** Holds what the scraper collects, which is the record the warehouse is rebuilt from. */
  readonly raw: s3.Bucket

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    })

    // The warehouse runs for a few minutes each week and sleeps the rest of the time. A minimum of
    // zero capacity lets it stop entirely between runs. Waking it takes about fifteen seconds,
    // which a scheduled run can wait for and which no visitor ever meets, because the site is
    // built ahead of time and the API reads a snapshot.
    this.warehouse = new rds.DatabaseCluster(this, 'Warehouse', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_17_5,
      }),
      writer: rds.ClusterInstance.serverlessV2('Writer'),
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 2,
      serverlessV2AutoPauseDuration: AUTO_PAUSE,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      port: WAREHOUSE_PORT,
      credentials: rds.Credentials.fromGeneratedSecret(WAREHOUSE_USERNAME),
      defaultDatabaseName: WAREHOUSE_DATABASE,
      storageEncrypted: true,
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // The scrape is slow and polite to the site it reads, so what it collects is kept rather than
    // gathered again. Versions guard against a bad run overwriting a good one.
    this.raw = new s3.Bucket(this, 'Raw', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // Everything here is built from the warehouse or from the repository, so it can be thrown away
    // and made again. Versions let a deployment roll back to the package before it.
    this.artifacts = new s3.Bucket(this, 'Artifacts', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ noncurrentVersionExpiration: cdk.Duration.days(30) }],
    })

    new cdk.CfnOutput(this, 'WarehouseEndpoint', {
      value: this.warehouse.clusterEndpoint.hostname,
    })
    new cdk.CfnOutput(this, 'WarehouseSecretArn', {
      value: this.warehouse.secret?.secretArn ?? 'none',
    })
    new cdk.CfnOutput(this, 'ArtifactsBucket', { value: this.artifacts.bucketName })
    new cdk.CfnOutput(this, 'RawBucket', { value: this.raw.bucketName })
  }
}
