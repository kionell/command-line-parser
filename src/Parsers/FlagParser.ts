import {
  IFlag,
  ICommand,
  IFlagParserOptions,
  IHasFlags,
  IArgument,
  IHasArgument,
} from '../Interfaces';

import {
  addDoubleQuotes,
  escapeRegExp,
  splitByDoubleQuotes,
} from '../Utils';

/**
 * A flag parser.
 */
export class FlagParser {
  /**
   * Whether to throw error or not.
   */
  private _throwError = true;

  /**
   * The command which will be used to parse flags.
   */
  private _command: ICommand & IHasFlags;

  /** 
   * The prefix of a shortened flag.
   */
  private _shortPrefix?: string;

  /**
   * The prefix of a full flag.
   */
  private _fullPrefix?: string;

  /**
   * The suffix of a flag.
   */
  private _suffix?: string;

  /**
   * The list of all command flags.
   */
  private _flags: Map<string, IFlag>;

  /**
   * The argument instance of this command.
   */
  private _arg: IArgument | null;

  /**
   * Creates a new instance of a flag parser.
   * @param options The flag parser options.
   */
  constructor(options: IFlagParserOptions) {
    this._throwError = options?.throwError ?? this._throwError;
    this._shortPrefix = options?.shortPrefix ?? this._shortPrefix;
    this._fullPrefix = options?.fullPrefix ?? this._fullPrefix;
    this._suffix = options?.suffix ?? this._suffix;
    this._command = options.command;

    this._arg = (this._command as unknown as IHasArgument).arg ?? null;

    if (!this._command?.flags && this._throwError) {
      throw new Error('Flags list is not found!');
    }

    this._flags = this._command?.flags ?? new Map<string, IFlag>();
  }

  /**
   * Takes a string and collects command flags from it.
   * @param input Command line.
   * @returns Parsed command flags of the current command level.
   */
  parse(input: string): Map<string, IFlag> {
    const args = splitByDoubleQuotes(input);

    const parsed: Map<string, IFlag> = new Map();
    const positions = this._findFlagPositions(args);
    const cmdMinLength = this._arg?.isRequired ? this._arg?.minLength ?? 0 : 0;

    positions.forEach((currentFlag, currentPos) => {
      const flagWithArg = currentFlag.clone() as IFlag & IHasArgument;
      const values = [];

      /**
       * Possible args are starting from the current flag position.
       * We need to subtract 1 to skip the flag itself.
       */
      const possibleArgs = args.length - currentPos - 1;
      const flagMinLength = flagWithArg?.arg?.minLength ?? 0;
      const flagMaxLength = flagWithArg?.arg?.maxLength ?? 0;

      /**
       * Collecting the flag arguments. We go through all arguments 
       * from the beginning of the flag to reaching one of the options:
       *  1) end of the number of possible arguments.
       *  2) end of the current flag.
       *  3) flag has collected all of its args.
       *  4) minimum number of arguments at which it is possible 
       *     to receive command arguments if the flag is infinite.
       */
      let collectedArgs = -1;

      while (++collectedArgs < possibleArgs) {
        const isEndOfFlag = positions.has(++currentPos);
        const isCollected = collectedArgs >= flagMaxLength;
        const isOnMinimum = cmdMinLength >= possibleArgs - collectedArgs;

        if (isEndOfFlag || isCollected || isOnMinimum) break;

        values.push(args[currentPos]);
      }

      /**
       * Throw an error if there are not enough arguments.
       */
      if (collectedArgs < flagMinLength) {
        if (this._throwError) {
          throw new Error(`Not enough arguments for ${currentFlag.name} flag!`);
        }

        return;
      }

      /**
       * We need to double quote all arguments before adding a new value.
       */
      flagWithArg?.arg?.setValue(values.map(addDoubleQuotes).join(' '));

      parsed.set(flagWithArg.name, flagWithArg);
    });

    return parsed;
  }

  /**
   * Removes flags from command line.
   * @param input Command line.
   * @param flags Preprocessed flags.
   * @returns Command line with no flags.
   */
  getCommandLineWithoutFlags(input: string, flags?: Map<string, IFlag>): string {
    flags ??= this.parse(input);

    flags.forEach((flag) => {
      const flagWithArg = flag as IFlag & IHasArgument;

      const shortPrefix = this._shortPrefix ?? flagWithArg.shortPrefix;
      const shortFlag = escapeRegExp(shortPrefix + flagWithArg.shortName);

      const fullPrefix = this._fullPrefix ?? flagWithArg.prefix;
      const fullFlag = escapeRegExp(fullPrefix + flagWithArg.name);

      const flagValue = flagWithArg.arg?.toString();

      let stringified = `(${shortFlag}|${fullFlag})`;

      if (typeof flagValue !== 'undefined') {
        stringified += escapeRegExp(` ${flagValue}`);
      }

      const regex = new RegExp(stringified);

      input = input.replace(regex, '');
    });

    return input.trim();
  }

  private _findFlagPositions(args: string[]): Map<number, IFlag> {
    const positions: Map<number, IFlag> = new Map<number, IFlag>();

    args.forEach((arg, index) => {
      const flag = this._getFlagByNameOrShortname(arg);

      if (flag) positions.set(index, flag);
    });

    return positions;
  }

  /**
   * Tries to find a command from the commands list by name or alias.
   * @param input Command name or alias.
   * @return The found command or null.
   */
  private _getFlagByNameOrShortname(input: string): IFlag | null {
    for (const flag of this._flags.values()) {
      const shortPrefix = flag.shortPrefix ?? this._shortPrefix ?? '';
      const fullPrefix = flag.prefix ?? this._fullPrefix ?? '';
      const suffix = flag.suffix ?? this._suffix ?? '';

      // Exact match by short version of a flag.
      if (input === shortPrefix + flag.shortName + suffix) return flag;

      // Exact match by full version of a flag.
      if (input === fullPrefix + flag.name + suffix) return flag;
    }

    return null;
  }
}
