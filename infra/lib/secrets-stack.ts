import * as cdk from 'aws-cdk-lib'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'

/** One secret this stack raises. */
interface SecretDefinition {
  /**
   * Names the resources of this secret inside the stack.
   *
   * It cannot be changed once the stack is deployed. It is part of the logical name of the secret,
   * and CloudFormation answers a logical name it has not seen by creating a second secret. The
   * second one carries the same `secretName`, which Secrets Manager refuses.
   */
  readonly id: string
  readonly secretName: string
  readonly description: string
  /** The keys the secret holds, each raised empty. */
  readonly keys: readonly string[]
  /**
   * The one key whose value the service generates.
   *
   * Secrets Manager will not raise a secret from a template alone. One key has to be generated, and
   * the value it is given is a random string that stands in until the real one is written.
   */
  readonly generatedKey: string
}

/** Every secret of the project. A secret is added here and nowhere else. */
const SECRETS: readonly SecretDefinition[] = [
  {
    id: 'Kaggle',
    secretName: 'ohfootball/kaggle',
    description: 'Kaggle account that owns the published dataset',
    keys: ['username', 'dataset'],
    generatedKey: 'key',
  },
]

/**
 * The secrets of the project, raised empty.
 *
 * A template is stored by CloudFormation and read by anyone who can read the stack, so no value of
 * a secret may pass through this file. What the stack raises is the secret itself, with a key for
 * every value it will hold and nothing in any of them. The values are written afterwards with
 * `put-secret-value`.
 *
 * A deployment that leaves the shape of a secret alone leaves its values alone with it. Changing
 * the shape does not. CloudFormation writes a new version of a secret whenever the property
 * describing how to generate it changes, so adding a key to `keys`, or changing `generatedKey`,
 * puts the empty template back and the values written by hand are gone. Write them again after any
 * such change.
 *
 * Each secret is kept when the stack is taken down. A credential is held nowhere else, and a stack
 * removed by mistake would otherwise take it with it. That means a secret of the same name survives
 * the stack, and raising the stack again needs the surviving secret removed or brought in first.
 * Removing one takes it out of reach for a recovery window of at least seven days unless the
 * removal is forced, and the name stays taken for the whole of that window.
 *
 * A stack that reads a secret names it. Secrets Manager mints a suffix when a secret is created, so
 * the whole ARN cannot be written down ahead of time, but it resolves a name in the same account and
 * region to the secret that carries it. The name is set here, so no stack reference and no published
 * value tie the two stacks together and either side can change alone.
 *
 * The warehouse keeps its own secret. That one is raised by the cluster, which rotates and attaches
 * it, so it stays in the stack that owns the cluster rather than moving here.
 */
export class SecretsStack extends cdk.Stack {
  /** Every secret raised here, by the identifier it was named with. */
  readonly secrets: Record<string, secretsmanager.Secret> = {}

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    for (const definition of SECRETS) {
      const secret = new secretsmanager.Secret(this, `${definition.id}Secret`, {
        secretName: definition.secretName,
        description: definition.description,
        generateSecretString: {
          secretStringTemplate: JSON.stringify(
            Object.fromEntries(definition.keys.map((key) => [key, ''])),
          ),
          generateStringKey: definition.generatedKey,
        },
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      })
      this.secrets[definition.id] = secret
    }
  }
}
