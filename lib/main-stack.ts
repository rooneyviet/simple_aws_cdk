import { Duration, Stack, StackProps } from "aws-cdk-lib";
import {
  Vpc,
  Instance,
  InstanceType,
  AmazonLinuxImage,
  AmazonLinuxGeneration,
  SecurityGroup,
  Peer,
  Port,
  SubnetType,
  UserData,
  InstanceClass,
  InstanceSize,
  IpAddresses,
  KeyPair,
  KeyPairType,
} from "aws-cdk-lib/aws-ec2";
import {
  ApplicationTargetGroup,
  TargetType,
  ApplicationProtocol,
  ApplicationLoadBalancer,
  ListenerAction,
  Protocol,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { HostedZone, ARecord, RecordTarget } from "aws-cdk-lib/aws-route53";
import { LoadBalancerTarget } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs/lib/construct";
import { InstanceTarget } from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

interface MyStackProps extends StackProps {
  vpcCidr?: string;
  maxAzs?: number;
  instanceType?: string;
  keyName?: string;
  userdataFile?: string;
}

export class MainStack extends Stack {
  constructor(scope: Construct, id: string, props: MyStackProps) {
    super(scope, id, props);

    // Custom VPC
    const vpc = new Vpc(this, "vpc", {
      vpcName: resourceName("vpc"),
      ipAddresses: IpAddresses.cidr(props.vpcCidr || "10.0.0.0/16"),
      maxAzs: props.maxAzs || 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "publicSubnet",
          subnetType: SubnetType.PUBLIC,
        },
      ],
    });

    // Security Group
    const securityGroup = new SecurityGroup(this, resourceName("websg"), {
      vpc,
      allowAllOutbound: true,
      securityGroupName: resourceName("websg"),
    });
    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(22));
    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80));
    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(443));
    securityGroup.addIngressRule(Peer.anyIpv6(), Port.tcp(443));
    securityGroup.addIngressRule(Peer.anyIpv6(), Port.tcp(80));

    // EC2 instance
    const instance = new Instance(this, resourceName("instance"), {
      vpc,
      instanceName: resourceName("instance"),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      instanceType: InstanceType.of(
        InstanceClass.BURSTABLE2,
        InstanceSize.MICRO
      ),
      keyPair: KeyPair.fromKeyPairAttributes(this, "key-pair", {
        keyPairName: props.keyName || "my-key-pair",
        type: KeyPairType.RSA,
      }),
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      securityGroup: securityGroup,
    });

    // Userdata
    if (props.userdataFile) {
      const asset = new Asset(this, "Asset", {
        path: path.join(__dirname, "assets", props.userdataFile),
      });
      asset.grantRead(instance.role);
      const localPath = instance.userData.addS3DownloadCommand({
        bucket: asset.bucket,
        bucketKey: asset.s3ObjectKey,
      });

      instance.userData.addExecuteFileCommand({
        filePath: localPath,
      });
    }

    // Target Group
    const targetGroup = new ApplicationTargetGroup(this, "TG", {
      vpc,
      targetType: TargetType.INSTANCE,
      targetGroupName: resourceName("tg"),
      port: 80,
      protocol: ApplicationProtocol.HTTP,
      targets: [new InstanceTarget(instance)],
      healthCheck: {
        protocol: Protocol.HTTP,
        path: "/", // The path for the health check
        healthyHttpCodes: "200-399", // The HTTP codes to consider healthy
        timeout: Duration.seconds(40), // Health check timeout
        interval: Duration.seconds(50), // Time between health checks
        healthyThresholdCount: 5, // Number of successful checks to consider the target healthy
        unhealthyThresholdCount: 5, // Number of failed checks to consider the target unhealthy
      },
    });

    // Security Group For Load Balancer
    const albSG = new SecurityGroup(this, resourceName("albSG"), {
      vpc,
      allowAllOutbound: true,
      securityGroupName: resourceName("albSG"),
    });
    albSG.addIngressRule(Peer.anyIpv4(), Port.tcp(80));
    albSG.addIngressRule(Peer.anyIpv4(), Port.tcp(443));

    // Application Load Balancer
    const loadBalancer = new ApplicationLoadBalancer(
      this,
      resourceName("alb"),
      {
        vpc,
        loadBalancerName: resourceName("alb"),
        internetFacing: true,
        securityGroup: albSG,
      }
    );

    const certificate = Certificate.fromCertificateArn(
      this,
      resourceName("certificate"),
      process.env.CERTIFICATE_ARN || ""
    );

    loadBalancer.addListener("Listener443", {
      port: 443,
      defaultAction: ListenerAction.forward([targetGroup]),
      certificates: [certificate],
      open: true,
    });

    loadBalancer.addRedirect({
      sourceProtocol: ApplicationProtocol.HTTP,
      sourcePort: 80,
      targetProtocol: ApplicationProtocol.HTTPS,
      targetPort: 443,
      open: true,
    });

    // Route 53
    const hostedZone = HostedZone.fromLookup(this, "HostedZone", {
      domainName: `${process.env.DOMAIN_NAME}.com`,
    });
    new ARecord(this, "AliasRecord", {
      zone: hostedZone,
      recordName: process.env.SUB_DOMAIN_NAME,
      target: RecordTarget.fromAlias(new LoadBalancerTarget(loadBalancer)),
    });

    function resourceName(resource: string) {
      return `${process.env.RESOURCE_COMMON_NAME}-${resource}`;
    }
  }
}
