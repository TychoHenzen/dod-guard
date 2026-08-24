#!/usr/bin/env node
import { createRequire as __createRequire } from "module"; const require = __createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/commander/lib/error.js
var require_error = __commonJS({
  "node_modules/commander/lib/error.js"(exports) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
  }
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "node_modules/commander/lib/argument.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.length > 3 && this._name.slice(-3) === "...") {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       *
       * @returns {Argument}
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       *
       * @returns {Argument}
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports.Argument = Argument2;
    exports.humanReadableArgName = humanReadableArgName;
  }
});

// node_modules/commander/lib/help.js
var require_help = __commonJS({
  "node_modules/commander/lib/help.js"(exports) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.minWidthToWrap = 40;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * prepareContext is called by Commander after applying overrides from `Command.configureHelp()`
       * and just before calling `formatHelp()`.
       *
       * Commander just uses the helpWidth and the rest is provided for optional use by more complex subclasses.
       *
       * @param {{ error?: boolean, helpWidth?: number, outputHasColors?: boolean }} contextOptions
       */
      prepareContext(contextOptions) {
        this.helpWidth = this.helpWidth ?? contextOptions.helpWidth ?? 80;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        const helpCommand = cmd._getHelpCommand();
        if (helpCommand && !helpCommand._hidden) {
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns {number}
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const helpOption = cmd._getHelpOption();
        if (helpOption && !helpOption.hidden) {
          const removeShort = helpOption.short && cmd._findOption(helpOption.short);
          const removeLong = helpOption.long && cmd._findOption(helpOption.long);
          if (!removeShort && !removeLong) {
            visibleOptions.push(helpOption);
          } else if (helpOption.long && !removeLong) {
            visibleOptions.push(
              cmd.createOption(helpOption.long, helpOption.description)
            );
          } else if (helpOption.short && !removeShort) {
            visibleOptions.push(
              cmd.createOption(helpOption.short, helpOption.description)
            );
          }
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter(
            (option) => !option.hidden
          );
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(
            max,
            this.displayWidth(
              helper.styleSubcommandTerm(helper.subcommandTerm(command))
            )
          );
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(
            max,
            this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
          );
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(
            max,
            this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
          );
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(
            max,
            this.displayWidth(
              helper.styleArgumentTerm(helper.argumentTerm(argument))
            )
          );
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(
              `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
            );
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          return `${option.description} (${extraInfo.join(", ")})`;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(
            `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
          );
        }
        if (extraInfo.length > 0) {
          const extraDescription = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescription}`;
          }
          return extraDescription;
        }
        return argument.description;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth ?? 80;
        function callFormatItem(term, description) {
          return helper.formatItem(term, termWidth, description, helper);
        }
        let output = [
          `${helper.styleTitle("Usage:")} ${helper.styleUsage(helper.commandUsage(cmd))}`,
          ""
        ];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([
            helper.boxWrap(
              helper.styleCommandDescription(commandDescription),
              helpWidth
            ),
            ""
          ]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return callFormatItem(
            helper.styleArgumentTerm(helper.argumentTerm(argument)),
            helper.styleArgumentDescription(helper.argumentDescription(argument))
          );
        });
        if (argumentList.length > 0) {
          output = output.concat([
            helper.styleTitle("Arguments:"),
            ...argumentList,
            ""
          ]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => {
          return callFormatItem(
            helper.styleOptionTerm(helper.optionTerm(option)),
            helper.styleOptionDescription(helper.optionDescription(option))
          );
        });
        if (optionList.length > 0) {
          output = output.concat([
            helper.styleTitle("Options:"),
            ...optionList,
            ""
          ]);
        }
        if (helper.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return callFormatItem(
              helper.styleOptionTerm(helper.optionTerm(option)),
              helper.styleOptionDescription(helper.optionDescription(option))
            );
          });
          if (globalOptionList.length > 0) {
            output = output.concat([
              helper.styleTitle("Global Options:"),
              ...globalOptionList,
              ""
            ]);
          }
        }
        const commandList = helper.visibleCommands(cmd).map((cmd2) => {
          return callFormatItem(
            helper.styleSubcommandTerm(helper.subcommandTerm(cmd2)),
            helper.styleSubcommandDescription(helper.subcommandDescription(cmd2))
          );
        });
        if (commandList.length > 0) {
          output = output.concat([
            helper.styleTitle("Commands:"),
            ...commandList,
            ""
          ]);
        }
        return output.join("\n");
      }
      /**
       * Return display width of string, ignoring ANSI escape sequences. Used in padding and wrapping calculations.
       *
       * @param {string} str
       * @returns {number}
       */
      displayWidth(str) {
        return stripColor(str).length;
      }
      /**
       * Style the title for displaying in the help. Called with 'Usage:', 'Options:', etc.
       *
       * @param {string} str
       * @returns {string}
       */
      styleTitle(str) {
        return str;
      }
      styleUsage(str) {
        return str.split(" ").map((word) => {
          if (word === "[options]") return this.styleOptionText(word);
          if (word === "[command]") return this.styleSubcommandText(word);
          if (word[0] === "[" || word[0] === "<")
            return this.styleArgumentText(word);
          return this.styleCommandText(word);
        }).join(" ");
      }
      styleCommandDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleOptionDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleSubcommandDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleArgumentDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleDescriptionText(str) {
        return str;
      }
      styleOptionTerm(str) {
        return this.styleOptionText(str);
      }
      styleSubcommandTerm(str) {
        return str.split(" ").map((word) => {
          if (word === "[options]") return this.styleOptionText(word);
          if (word[0] === "[" || word[0] === "<")
            return this.styleArgumentText(word);
          return this.styleSubcommandText(word);
        }).join(" ");
      }
      styleArgumentTerm(str) {
        return this.styleArgumentText(str);
      }
      styleOptionText(str) {
        return str;
      }
      styleArgumentText(str) {
        return str;
      }
      styleSubcommandText(str) {
        return str;
      }
      styleCommandText(str) {
        return str;
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Detect manually wrapped and indented strings by checking for line break followed by whitespace.
       *
       * @param {string} str
       * @returns {boolean}
       */
      preformatted(str) {
        return /\n[^\S\r\n]/.test(str);
      }
      /**
       * Format the "item", which consists of a term and description. Pad the term and wrap the description, indenting the following lines.
       *
       * So "TTT", 5, "DDD DDDD DD DDD" might be formatted for this.helpWidth=17 like so:
       *   TTT  DDD DDDD
       *        DD DDD
       *
       * @param {string} term
       * @param {number} termWidth
       * @param {string} description
       * @param {Help} helper
       * @returns {string}
       */
      formatItem(term, termWidth, description, helper) {
        const itemIndent = 2;
        const itemIndentStr = " ".repeat(itemIndent);
        if (!description) return itemIndentStr + term;
        const paddedTerm = term.padEnd(
          termWidth + term.length - helper.displayWidth(term)
        );
        const spacerWidth = 2;
        const helpWidth = this.helpWidth ?? 80;
        const remainingWidth = helpWidth - termWidth - spacerWidth - itemIndent;
        let formattedDescription;
        if (remainingWidth < this.minWidthToWrap || helper.preformatted(description)) {
          formattedDescription = description;
        } else {
          const wrappedDescription = helper.boxWrap(description, remainingWidth);
          formattedDescription = wrappedDescription.replace(
            /\n/g,
            "\n" + " ".repeat(termWidth + spacerWidth)
          );
        }
        return itemIndentStr + paddedTerm + " ".repeat(spacerWidth) + formattedDescription.replace(/\n/g, `
${itemIndentStr}`);
      }
      /**
       * Wrap a string at whitespace, preserving existing line breaks.
       * Wrapping is skipped if the width is less than `minWidthToWrap`.
       *
       * @param {string} str
       * @param {number} width
       * @returns {string}
       */
      boxWrap(str, width) {
        if (width < this.minWidthToWrap) return str;
        const rawLines = str.split(/\r\n|\n/);
        const chunkPattern = /[\s]*[^\s]+/g;
        const wrappedLines = [];
        rawLines.forEach((line) => {
          const chunks = line.match(chunkPattern);
          if (chunks === null) {
            wrappedLines.push("");
            return;
          }
          let sumChunks = [chunks.shift()];
          let sumWidth = this.displayWidth(sumChunks[0]);
          chunks.forEach((chunk) => {
            const visibleWidth = this.displayWidth(chunk);
            if (sumWidth + visibleWidth <= width) {
              sumChunks.push(chunk);
              sumWidth += visibleWidth;
              return;
            }
            wrappedLines.push(sumChunks.join(""));
            const nextChunk = chunk.trimStart();
            sumChunks = [nextChunk];
            sumWidth = this.displayWidth(nextChunk);
          });
          wrappedLines.push(sumChunks.join(""));
        });
        return wrappedLines.join("\n");
      }
    };
    function stripColor(str) {
      const sgrPattern = /\x1b\[\d*(;\d*)*m/g;
      return str.replace(sgrPattern, "");
    }
    exports.Help = Help2;
    exports.stripColor = stripColor;
  }
});

// node_modules/commander/lib/option.js
var require_option = __commonJS({
  "node_modules/commander/lib/option.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {(string | string[])} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as an object attribute key.
       *
       * @return {string}
       */
      attributeName() {
        if (this.negate) {
          return camelcase(this.name().replace(/^no-/, ""));
        }
        return camelcase(this.name());
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @package
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @package
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str) {
      return str.split("-").reduce((str2, word) => {
        return str2 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const shortFlagExp = /^-[^-]$/;
      const longFlagExp = /^--[^-]/;
      const flagParts = flags.split(/[ |,]+/).concat("guard");
      if (shortFlagExp.test(flagParts[0])) shortFlag = flagParts.shift();
      if (longFlagExp.test(flagParts[0])) longFlag = flagParts.shift();
      if (!shortFlag && shortFlagExp.test(flagParts[0]))
        shortFlag = flagParts.shift();
      if (!shortFlag && longFlagExp.test(flagParts[0])) {
        shortFlag = longFlag;
        longFlag = flagParts.shift();
      }
      if (flagParts[0].startsWith("-")) {
        const unsupportedFlag = flagParts[0];
        const baseError = `option creation failed due to '${unsupportedFlag}' in option flags '${flags}'`;
        if (/^-[^-][^-]/.test(unsupportedFlag))
          throw new Error(
            `${baseError}
- a short flag is a single dash and a single character
  - either use a single dash and a single character (for a short flag)
  - or use a double dash for a long option (and can have two, like '--ws, --workspace')`
          );
        if (shortFlagExp.test(unsupportedFlag))
          throw new Error(`${baseError}
- too many short flags`);
        if (longFlagExp.test(unsupportedFlag))
          throw new Error(`${baseError}
- too many long flags`);
        throw new Error(`${baseError}
- unrecognised flag format`);
      }
      if (shortFlag === void 0 && longFlag === void 0)
        throw new Error(
          `option creation failed due to no flags found in '${flags}'.`
        );
      return { shortFlag, longFlag };
    }
    exports.Option = Option2;
    exports.DualOptions = DualOptions;
  }
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "node_modules/commander/lib/suggestSimilar.js"(exports) {
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports.suggestSimilar = suggestSimilar;
  }
});

// node_modules/commander/lib/command.js
var require_command = __commonJS({
  "node_modules/commander/lib/command.js"(exports) {
    var EventEmitter = __require("node:events").EventEmitter;
    var childProcess = __require("node:child_process");
    var path = __require("node:path");
    var fs = __require("node:fs");
    var process2 = __require("node:process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2, stripColor } = require_help();
    var { Option: Option2, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = false;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._savedState = null;
        this._outputConfiguration = {
          writeOut: (str) => process2.stdout.write(str),
          writeErr: (str) => process2.stderr.write(str),
          outputError: (str, write) => write(str),
          getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
          getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
          getOutHasColors: () => useColor() ?? (process2.stdout.isTTY && process2.stdout.hasColors?.()),
          getErrHasColors: () => useColor() ?? (process2.stderr.isTTY && process2.stderr.hasColors?.()),
          stripColor: (str) => stripColor(str)
        };
        this._hidden = false;
        this._helpOption = void 0;
        this._addImplicitHelpCommand = void 0;
        this._helpCommand = void 0;
        this._helpConfiguration = {};
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // change how output being written, defaults to stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // change how output being written for errors, defaults to writeErr
       *     outputError(str, write) // used for displaying errors and not used for displaying help
       *     // specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // color support, currently only used with Help
       *     getOutHasColors()
       *     getErrHasColors()
       *     stripColor() // used to remove ANSI escape codes if output does not have colors
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        Object.assign(this._outputConfiguration, configuration);
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {(boolean|string)} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd._checkForBrokenPassThrough();
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {(Function|*)} [fn] - custom argument processing function
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, fn, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof fn === "function") {
          argument.default(defaultValue).argParser(fn);
        } else {
          argument.default(fn);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument && previousArgument.variadic) {
          throw new Error(
            `only the last argument can be variadic '${previousArgument.name()}'`
          );
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(
            `a default value for a required argument is never used: '${argument.name()}'`
          );
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
       *
       * @example
       *    program.helpCommand('help [cmd]');
       *    program.helpCommand('help [cmd]', 'show help');
       *    program.helpCommand(false); // suppress default help command
       *    program.helpCommand(true); // add help command even if no subcommands
       *
       * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
       * @param {string} [description] - custom description
       * @return {Command} `this` command for chaining
       */
      helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === "boolean") {
          this._addImplicitHelpCommand = enableOrNameAndArgs;
          return this;
        }
        enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
        const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? "display help for command";
        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs) helpCommand.arguments(helpArgs);
        if (helpDescription) helpCommand.description(helpDescription);
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Add prepared custom help command.
       *
       * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
       * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== "object") {
          this.helpCommand(helpCommand, deprecatedDescription);
          return this;
        }
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Lazy create help command.
       *
       * @return {(Command|null)}
       * @package
       */
      _getHelpCommand() {
        const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
        if (hasImplicitHelpCommand) {
          if (this._helpCommand === void 0) {
            this.helpCommand(void 0, void 0);
          }
          return this._helpCommand;
        }
        return null;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process2.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {(Option | Argument)} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Check for option flag conflicts.
       * Register option if no conflicts found, or throw on conflict.
       *
       * @param {Option} option
       * @private
       */
      _registerOption(option) {
        const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
        if (matchingOption) {
          const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
          throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
        this.options.push(option);
      }
      /**
       * Check for command name and alias conflicts with existing commands.
       * Register command if no conflicts found, or throw on conflict.
       *
       * @param {Command} command
       * @private
       */
      _registerCommand(command) {
        const knownBy = (cmd) => {
          return [cmd.name()].concat(cmd.aliases());
        };
        const alreadyUsed = knownBy(command).find(
          (name) => this._findCommand(name)
        );
        if (alreadyUsed) {
          const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
          const newCmd = knownBy(command).join("|");
          throw new Error(
            `cannot add command '${newCmd}' as already have command '${existingCmd}'`
          );
        }
        this.commands.push(command);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        this._registerOption(option);
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(
              name,
              option.defaultValue === void 0 ? true : option.defaultValue,
              "default"
            );
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._concatValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @return {Command} `this` command for chaining
       * @private
       */
      _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error(
            "To add an Option object use addOption() instead of option() or requiredOption()"
          );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('--pt, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
       * Add a required option which must have a value after parsing. This usually means
       * the option must be specified on the command line. (Otherwise the same as .option().)
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx(
          { mandatory: true },
          flags,
          description,
          parseArg,
          defaultValue
        );
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
       * @return {Command} `this` command for chaining
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
       * @return {Command} `this` command for chaining
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
       * @return {Command} `this` command for chaining
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {boolean} [positional]
       * @return {Command} `this` command for chaining
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {boolean} [passThrough] for unknown options.
       * @return {Command} `this` command for chaining
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._checkForBrokenPassThrough();
        return this;
      }
      /**
       * @private
       */
      _checkForBrokenPassThrough() {
        if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
          throw new Error(
            `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
          );
        }
      }
      /**
       * Whether to store option values as properties on command object,
       * or store separately (specify false). In both cases the option values can be accessed using .opts().
       *
       * @param {boolean} [storeAsProperties=true]
       * @return {Command} `this` command for chaining
       */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        if (Object.keys(this._optionValues).length) {
          throw new Error(
            "call .storeOptionsAsProperties() before setting option values"
          );
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
       * Get source of option value.
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
       * Get source of option value. See also .optsWithGlobals().
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0 && parseOptions.from === void 0) {
          if (process2.versions?.electron) {
            parseOptions.from = "electron";
          }
          const execArgv = process2.execArgv ?? [];
          if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
            parseOptions.from = "eval";
          }
        }
        if (argv === void 0) {
          argv = process2.argv;
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process2.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          case "eval":
            userArgs = argv.slice(1);
            break;
          default:
            throw new Error(
              `unexpected parse option { from: '${parseOptions.from}' }`
            );
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * program.parse(); // parse process.argv and auto-detect electron and special node flags
       * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        this._prepareForParse();
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
       * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        this._prepareForParse();
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      _prepareForParse() {
        if (this._savedState === null) {
          this.saveStateBeforeParse();
        } else {
          this.restoreStateBeforeParse();
        }
      }
      /**
       * Called the first time parse is called to save state and allow a restore before subsequent calls to parse.
       * Not usually called directly, but available for subclasses to save their custom state.
       *
       * This is called in a lazy way. Only commands used in parsing chain will have state saved.
       */
      saveStateBeforeParse() {
        this._savedState = {
          // name is stable if supplied by author, but may be unspecified for root command and deduced during parsing
          _name: this._name,
          // option values before parse have default values (including false for negated options)
          // shallow clones
          _optionValues: { ...this._optionValues },
          _optionValueSources: { ...this._optionValueSources }
        };
      }
      /**
       * Restore state before parse for calls after the first.
       * Not usually called directly, but available for subclasses to save their custom state.
       *
       * This is called in a lazy way. Only commands used in parsing chain will have state restored.
       */
      restoreStateBeforeParse() {
        if (this._storeOptionsAsProperties)
          throw new Error(`Can not call parse again when storeOptionsAsProperties is true.
- either make a new Command for each call to parse, or stop storing options as properties`);
        this._name = this._savedState._name;
        this._scriptPath = null;
        this.rawArgs = [];
        this._optionValues = { ...this._savedState._optionValues };
        this._optionValueSources = { ...this._savedState._optionValueSources };
        this.args = [];
        this.processedArgs = [];
      }
      /**
       * Throw if expected executable is missing. Add lots of help for author.
       *
       * @param {string} executableFile
       * @param {string} executableDir
       * @param {string} subcommandName
       */
      _checkForMissingExecutable(executableFile, executableDir, subcommandName) {
        if (fs.existsSync(executableFile)) return;
        const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
        const executableMissing = `'${executableFile}' does not exist
 - if '${subcommandName}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
        throw new Error(executableMissing);
      }
      /**
       * Execute a sub-command executable.
       *
       * @private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path.resolve(baseDir, baseName);
          if (fs.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path.extname(baseName))) return void 0;
          const foundExt = sourceExt.find(
            (ext) => fs.existsSync(`${localBin}${ext}`)
          );
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs.realpathSync(this._scriptPath);
          } catch {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path.resolve(
            path.dirname(resolvedScriptPath),
            executableDir
          );
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path.basename(
              this._scriptPath,
              path.extname(this._scriptPath)
            );
            if (legacyName !== this._name) {
              localFile = findFile(
                executableDir,
                `${legacyName}-${subcommand._name}`
              );
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path.extname(executableFile));
        let proc;
        if (process2.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process2.execArgv).concat(args);
            proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          this._checkForMissingExecutable(
            executableFile,
            executableDir,
            subcommand._name
          );
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process2.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        proc.on("close", (code) => {
          code = code ?? 1;
          if (!exitCallback) {
            process2.exit(code);
          } else {
            exitCallback(
              new CommanderError2(
                code,
                "commander.executeSubCommandAsync",
                "(close)"
              )
            );
          }
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            this._checkForMissingExecutable(
              executableFile,
              executableDir,
              subcommand._name
            );
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process2.exit(1);
          } else {
            const wrappedError = new CommanderError2(
              1,
              "commander.executeSubCommandAsync",
              "(error)"
            );
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        subCommand._prepareForParse();
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(
          promiseChain,
          subCommand,
          "preSubcommand"
        );
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(
          subcommandName,
          [],
          [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
        );
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {(Promise|undefined)} promise
       * @param {Function} fn
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCall(promise, fn) {
        if (promise && promise.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          this._outputHelpIfRequested(unknown);
          return this._dispatchSubcommand(
            this._defaultCommandName,
            operands,
            unknown
          );
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        this._outputHelpIfRequested(parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(
            promiseChain,
            () => this._actionHandler(this.processedArgs)
          );
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent && this.parent.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @private
       * @return {Command | undefined}
       */
      _findCommand(name) {
        if (!name) return void 0;
        return this.commands.find(
          (cmd) => cmd._name === name || cmd._aliases.includes(name)
        );
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @package
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === void 0) {
            return false;
          }
          return this.getOptionValueSource(optionKey) !== "default";
        });
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Side effects: modifies command by storing options. Does not reset state if called again.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {string[]} argv
       * @return {{operands: string[], unknown: string[]}}
       */
      parseOptions(argv) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        const args = argv.slice();
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        let activeVariadicOption = null;
        while (args.length) {
          const arg = args.shift();
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args);
            break;
          }
          if (activeVariadicOption && !maybeOption(arg)) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args.shift();
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (args.length > 0 && !maybeOption(args[0])) {
                  value = args.shift();
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                args.unshift(`-${arg.slice(2)}`);
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (maybeOption(arg)) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
              operands.push(arg);
              if (args.length > 0) operands.push(...args);
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg);
            if (args.length > 0) dest.push(...args);
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(
          `${message}
`,
          this._outputConfiguration.writeErr
        );
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process2.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
              this.getOptionValueSource(optionKey)
            )) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter(
          (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
            this.getOptionValue(option.attributeName()),
            option
          )
        ).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(
              impliedKey,
              option.implied[impliedKey],
              "implied"
            );
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find(
            (target) => target.negate && optionKey === target.attributeName()
          );
          const positiveOption = this.options.find(
            (target) => !target.negate && optionKey === target.attributeName()
          );
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias()) candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
       */
      version(str, flags, description) {
        if (str === void 0) return this._version;
        this._version = str;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this._registerOption(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str}
`);
          this._exit(0, "commander.version", str);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {object} [argsDescription]
       * @return {(string|Command)}
       */
      description(str, argsDescription) {
        if (str === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      summary(str) {
        if (str === void 0) return this._summary;
        this._summary = str;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {(string|Command)}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        const matchingCommand = this.parent?._findCommand(alias);
        if (matchingCommand) {
          const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
          throw new Error(
            `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
          );
        }
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {(string[]|Command)}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      usage(str) {
        if (str === void 0) {
          if (this._usage) return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._helpOption !== null ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      name(str) {
        if (str === void 0) return this._name;
        this._name = str;
        return this;
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path.basename(filename, path.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {(string|null|Command)}
       */
      executableDir(path2) {
        if (path2 === void 0) return this._executableDir;
        this._executableDir = path2;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        const context = this._getOutputContext(contextOptions);
        helper.prepareContext({
          error: context.error,
          helpWidth: context.helpWidth,
          outputHasColors: context.hasColors
        });
        const text = helper.formatHelp(this, helper);
        if (context.hasColors) return text;
        return this._outputConfiguration.stripColor(text);
      }
      /**
       * @typedef HelpContext
       * @type {object}
       * @property {boolean} error
       * @property {number} helpWidth
       * @property {boolean} hasColors
       * @property {function} write - includes stripColor if needed
       *
       * @returns {HelpContext}
       * @private
       */
      _getOutputContext(contextOptions) {
        contextOptions = contextOptions || {};
        const error = !!contextOptions.error;
        let baseWrite;
        let hasColors;
        let helpWidth;
        if (error) {
          baseWrite = (str) => this._outputConfiguration.writeErr(str);
          hasColors = this._outputConfiguration.getErrHasColors();
          helpWidth = this._outputConfiguration.getErrHelpWidth();
        } else {
          baseWrite = (str) => this._outputConfiguration.writeOut(str);
          hasColors = this._outputConfiguration.getOutHasColors();
          helpWidth = this._outputConfiguration.getOutHelpWidth();
        }
        const write = (str) => {
          if (!hasColors) str = this._outputConfiguration.stripColor(str);
          return baseWrite(str);
        };
        return { error, write, hasColors, helpWidth };
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const outputContext = this._getOutputContext(contextOptions);
        const eventContext = {
          error: outputContext.error,
          write: outputContext.write,
          command: this
        };
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", eventContext));
        this.emit("beforeHelp", eventContext);
        let helpInformation = this.helpInformation({ error: outputContext.error });
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        outputContext.write(helpInformation);
        if (this._getHelpOption()?.long) {
          this.emit(this._getHelpOption().long);
        }
        this.emit("afterHelp", eventContext);
        this._getCommandAndAncestors().forEach(
          (command) => command.emit("afterAllHelp", eventContext)
        );
      }
      /**
       * You can pass in flags and a description to customise the built-in help option.
       * Pass in false to disable the built-in help option.
       *
       * @example
       * program.helpOption('-?, --help' 'show help'); // customise
       * program.helpOption(false); // disable
       *
       * @param {(string | boolean)} flags
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          if (flags) {
            this._helpOption = this._helpOption ?? void 0;
          } else {
            this._helpOption = null;
          }
          return this;
        }
        flags = flags ?? "-h, --help";
        description = description ?? "display help for command";
        this._helpOption = this.createOption(flags, description);
        return this;
      }
      /**
       * Lazy create help option.
       * Returns null if has been disabled with .helpOption(false).
       *
       * @returns {(Option | null)} the help option
       * @package
       */
      _getHelpOption() {
        if (this._helpOption === void 0) {
          this.helpOption(void 0, void 0);
        }
        return this._helpOption;
      }
      /**
       * Supply your own option to use for the built-in help option.
       * This is an alternative to using helpOption() to customise the flags and description etc.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addHelpOption(option) {
        this._helpOption = option;
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = Number(process2.exitCode ?? 0);
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * // Do a little typing to coordinate emit and listener for the help text events.
       * @typedef HelpTextEventContext
       * @type {object}
       * @property {boolean} error
       * @property {Command} command
       * @property {function} write
       */
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {(string | Function)} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
      /**
       * Output help information if help flags specified
       *
       * @param {Array} args - array of options to search for help flags
       * @private
       */
      _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
          this.outputHelp();
          this._exit(0, "commander.helpDisplayed", "(outputHelp)");
        }
      }
    };
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    function useColor() {
      if (process2.env.NO_COLOR || process2.env.FORCE_COLOR === "0" || process2.env.FORCE_COLOR === "false")
        return false;
      if (process2.env.FORCE_COLOR || process2.env.CLICOLOR_FORCE !== void 0)
        return true;
      return void 0;
    }
    exports.Command = Command2;
    exports.useColor = useColor;
  }
});

// node_modules/commander/index.js
var require_commander = __commonJS({
  "node_modules/commander/index.js"(exports) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports.program = new Command2();
    exports.createCommand = (name) => new Command2(name);
    exports.createOption = (flags, description) => new Option2(flags, description);
    exports.createArgument = (name, description) => new Argument2(name, description);
    exports.Command = Command2;
    exports.Option = Option2;
    exports.Argument = Argument2;
    exports.Help = Help2;
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
    exports.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// src/fossil-cli-core.ts
import { realpathSync as realpathSync2 } from "node:fs";
import { fileURLToPath } from "node:url";

// node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// src/analysis-error.ts
var FossilAnalysisError = class extends Error {
  code;
  constructor({ code, message }) {
    super(message);
    this.code = code;
  }
};

// src/fossil-output-core.ts
var BOLD = "\x1B[1m";
var RESET = "\x1B[0m";
function terminalSafeText(value) {
  return [...value].map((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === void 0 || codePoint > 31 && (codePoint < 127 || codePoint > 159)) {
      return character;
    }
    return `\\u${codePoint.toString(16).padStart(4, "0")}`;
  }).join("");
}
function topLevelDirectory(path) {
  const normalized = normalizedPath(path);
  const separator = normalized.indexOf("/");
  return separator === -1 ? void 0 : normalized.slice(0, separator);
}
function normalizedPath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}
function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function utcDate(timestampMs) {
  return new Date(timestampMs).toISOString().slice(0, 10);
}
function findingTableRows(burst, mode) {
  return burst.findings.map((finding) => ({ ...finding, normalizedPath: normalizedPath(finding.path) })).sort((left, right) => right.score - left.score || comparePaths(left.normalizedPath, right.normalizedPath)).flatMap((finding) => {
    const row = {
      kind: "finding",
      path: finding.normalizedPath,
      score: finding.score,
      scoreBasis: finding.scoreBasis
    };
    if (mode === "normal") return [row];
    return [
      row,
      {
        kind: "finding-explanation",
        createdInBurst: finding.activity.createdInBurst,
        burstCommits: finding.activity.burstCommits,
        postBurstCommits: finding.activity.postBurstCommits,
        referenceAvailability: finding.referenceAvailability,
        strongInboundReferences: finding.strongInboundReferences,
        candidateNeighbors: finding.candidateNeighbors.map(normalizedPath).sort(comparePaths),
        liveNeighbors: finding.liveNeighbors.map(normalizedPath).sort(comparePaths)
      }
    ];
  });
}
function burstTableRows(bursts, mode = "normal") {
  return [...bursts].sort(
    (left, right) => right.endTimestampMs - left.endTimestampMs || right.startTimestampMs - left.startTimestampMs || comparePaths(left.id, right.id)
  ).flatMap((burst) => [
    {
      kind: "burst",
      id: burst.id,
      startDate: utcDate(burst.startTimestampMs),
      endDate: utcDate(burst.endTimestampMs),
      commitCount: burst.commitCount,
      fileCount: burst.fileCount
    },
    ...burst.survivors.map((survivor) => normalizedPath(survivor.path)).sort(comparePaths).map((path) => ({ kind: "survivor", path })),
    ...findingTableRows(burst, mode)
  ]);
}
function styleBurstHeader(value, isTty) {
  return isTty ? `${BOLD}${value}${RESET}` : value;
}
function burstTableLine(row, isTty) {
  switch (row.kind) {
    case "burst":
      return styleBurstHeader(
        `Burst ${terminalSafeText(row.id)}: ${row.startDate} to ${row.endDate}, ${row.commitCount} commits, ${row.fileCount} files`,
        isTty
      );
    case "survivor":
      return `  survivor ${terminalSafeText(row.path)}`;
    case "finding":
      return `  finding ${terminalSafeText(row.path)}: score ${row.score} (${row.scoreBasis})`;
    case "finding-explanation": {
      const reference = row.referenceAvailability === "unavailable" ? "reference evidence unavailable" : `references: ${row.strongInboundReferences} strong inbound, ${row.candidateNeighbors.length} candidate neighbors, ${row.liveNeighbors.length} live neighbors`;
      return `    ${row.createdInBurst ? "created in burst" : "existed before burst"}; ${row.burstCommits} burst commits, ${row.postBurstCommits} post-burst commits; ${reference}`;
    }
  }
}
function renderBurstTableRows(rows, { isTty }) {
  return rows.map((row) => burstTableLine(row, isTty)).join("\n");
}
function renderFossilReportJson(report) {
  return JSON.stringify(finalizeFossilReport(report));
}
function candidateFindingCounts(bursts) {
  const paths = bursts.flatMap((burst) => burst.findings.map((finding) => normalizedPath(finding.path)));
  return { candidateFindingCount: paths.length, uniqueCandidatePathCount: new Set(paths).size };
}
function finalizeFossilReport(report) {
  return {
    ...report,
    statistics: { ...report.statistics, ...candidateFindingCounts(report.bursts) },
    warnings: [...report.warnings].sort(
      (left, right) => comparePaths(left.code, right.code) || comparePaths(normalizedPath(left.path ?? ""), normalizedPath(right.path ?? "")) || comparePaths(left.message, right.message)
    )
  };
}
function workspaceDebrisTableRows(findings, mode) {
  if (mode === "verbose") return findings.map((finding) => ({ kind: "finding", finding }));
  const ignoredDirectoryCounts = /* @__PURE__ */ new Map();
  for (const finding of findings) {
    const directory = finding.kind === "ignored" ? topLevelDirectory(finding.path) : void 0;
    if (directory) ignoredDirectoryCounts.set(directory, (ignoredDirectoryCounts.get(directory) ?? 0) + 1);
  }
  const summarizedDirectories = new Set(
    [...ignoredDirectoryCounts].filter(([, count]) => count >= 20).map(([directory]) => directory)
  );
  const emittedDirectories = /* @__PURE__ */ new Set();
  const rows = [];
  for (const finding of findings) {
    const directory = finding.kind === "ignored" ? topLevelDirectory(finding.path) : void 0;
    if (!(directory && summarizedDirectories.has(directory))) {
      rows.push({ kind: "finding", finding });
      continue;
    }
    if (emittedDirectories.has(directory)) continue;
    emittedDirectories.add(directory);
    rows.push({ kind: "ignored-directory-summary", directory, count: ignoredDirectoryCounts.get(directory) ?? 0 });
  }
  return rows;
}

// src/fossil-report-table.ts
function renderFossilReportTable(report, options) {
  const lines = statisticsLines(report);
  const bursts = renderBurstTableRows(
    burstTableRows(report.bursts, report.options.verbose ? "verbose" : "normal"),
    options
  );
  if (bursts) lines.push(bursts);
  if (report.warnings.length > 0) lines.push("Warnings:", ...report.warnings.map(warningTableLine));
  if (report.workspaceDebris.length > 0)
    lines.push(
      "Workspace debris:",
      ...workspaceDebrisTableRows(report.workspaceDebris, report.options.verbose ? "verbose" : "normal").map(
        debrisTableLine
      )
    );
  return lines.join("\n");
}
function statisticsLines(report) {
  return [
    `Repository statistics: ${report.statistics.includedCommitCount} commits, ${report.statistics.logicalFileCount} logical files, ${report.statistics.burstCount} bursts`,
    `Candidate findings: ${report.statistics.candidateFindingCount} (${report.statistics.uniqueCandidatePathCount} unique paths)`,
    `Workspace debris: ${report.statistics.workspaceDebrisCount}`
  ];
}
function warningTableLine(warning) {
  return `  ${terminalSafeText(warning.code)}${warning.path ? ` ${terminalSafeText(warning.path)}` : ""}: ${terminalSafeText(warning.message)}`;
}
function debrisTableLine(row) {
  if (row.kind === "ignored-directory-summary")
    return `  ignored directory ${terminalSafeText(row.directory)}: ${row.count} findings`;
  return `  ${terminalSafeText(row.finding.kind)} ${terminalSafeText(row.finding.path)}: ${terminalSafeText(row.finding.review)}`;
}

// src/repository-analysis.ts
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

// src/fossil-scoring-core.ts
function normalizedBurstChurn(candidate, burstFiles) {
  const maximumBurstCommits = Math.max(0, ...burstFiles.map((activity) => activity.burstCommits));
  if (maximumBurstCommits === 0) return 0;
  return Math.max(0, candidate.burstCommits) / maximumBurstCommits;
}
function abandonmentScore(candidate) {
  if (candidate.burstCommits <= 0) return 0;
  return Math.max(0, 1 - candidate.postBurstCommits / candidate.burstCommits);
}
function referenceWeaknessScore(candidatePath, graph, candidatePaths) {
  const liveInboundSources = new Set(
    graph.edges.filter(
      (edge) => edge.targetPath === candidatePath && edge.sourcePath !== candidatePath && edge.strength === "strong" && !candidatePaths.has(edge.sourcePath)
    ).map((edge) => edge.sourcePath)
  );
  if (liveInboundSources.size === 0) return 1;
  return liveInboundSources.size === 1 ? 0.5 : 0;
}
function clusterIsolationScore(candidatePath, graph, candidatePaths) {
  const neighbors = /* @__PURE__ */ new Set();
  for (const edge of graph.edges) {
    if (edge.sourcePath === candidatePath && edge.targetPath !== candidatePath) neighbors.add(edge.targetPath);
    if (edge.targetPath === candidatePath && edge.sourcePath !== candidatePath) neighbors.add(edge.sourcePath);
  }
  if (neighbors.size === 0) return 1;
  return [...neighbors].filter((neighbor) => candidatePaths.has(neighbor)).length / neighbors.size;
}
function candidateReferenceSubscores(candidatePath, graph, candidatePaths) {
  if (graph.unavailablePaths.includes(candidatePath)) return { available: false };
  return {
    available: true,
    referenceWeakness: referenceWeaknessScore(candidatePath, graph, candidatePaths),
    clusterIsolation: clusterIsolationScore(candidatePath, graph, candidatePaths)
  };
}
function scoreFossilSubscores(subscores) {
  if (subscores.referenceWeakness === void 0 && subscores.clusterIsolation === void 0) {
    return {
      score: 0.3 / 0.65 * subscores.churn + 0.35 / 0.65 * subscores.abandonment,
      basis: "git-only"
    };
  }
  if (subscores.referenceWeakness === void 0 || subscores.clusterIsolation === void 0) return void 0;
  return {
    score: 0.3 * subscores.churn + 0.35 * subscores.abandonment + 0.2 * subscores.referenceWeakness + 0.15 * subscores.clusterIsolation,
    basis: "full"
  };
}
function createAdvisoryFossilFinding(input) {
  return { ...input, classification: "advisory" };
}

// src/git-history-core.ts
var RECORD_SEPARATOR = "";
var MIN_CHANGE_POINT_GAP_MS = 4 * 60 * 60 * 1e3;
var MAX_CHANGE_POINT_SIMILARITY = 0.1;
var DEFAULT_MAXIMUM_INCLUDED_COMMITS = 1e5;
function assertIncludedCommitLimit(includedCommitCount, maximumIncludedCommits = DEFAULT_MAXIMUM_INCLUDED_COMMITS) {
  if (includedCommitCount > maximumIncludedCommits)
    throw new FossilAnalysisError({
      code: "resource_limit",
      message: "Included commit limit exceeded."
    });
}
function nonMergeGitLogArguments() {
  return [
    "log",
    "--no-ext-diff",
    "HEAD",
    "--no-merges",
    "--find-renames=50%",
    "--format=%x1e%H%x00%ct%x00",
    "--name-status",
    "-z"
  ];
}
function shallowRepositoryArguments() {
  return ["rev-parse", "--is-shallow-repository"];
}
function shallowHistoryWarnings(result) {
  if (result === "true" || result === "true\n" || result === "true\r\n") {
    return [
      {
        code: "shallow_history",
        message: "Repository is shallow; burst and consolidation history may be incomplete."
      }
    ];
  }
  if (result === "false" || result === "false\n" || result === "false\r\n") {
    return [];
  }
  throw new Error("Unexpected Git shallow-repository response");
}
function sparseCheckoutArguments() {
  return ["config", "--bool", "--get", "core.sparseCheckout"];
}
function sparseCheckoutWarnings(result) {
  if (result === "true" || result === "true\n" || result === "true\r\n") {
    return [
      {
        code: "sparse_checkout",
        message: "Sparse checkout is enabled; current-file existence and references may be incomplete."
      }
    ];
  }
  if (result === "" || result === "false" || result === "false\n" || result === "false\r\n") {
    return [];
  }
  throw new Error("Unexpected Git sparse-checkout response");
}
function statusFor(rawStatus) {
  switch (rawStatus[0]) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "type-changed";
    case "U":
      return "unmerged";
    default:
      return "unknown";
  }
}
function parseChanges(tokens) {
  const changes = [];
  for (let index = 0; index < tokens.length; ) {
    const rawStatus = tokens[index]?.replace(/^\r?\n/, "");
    if (!rawStatus) {
      index += 1;
      continue;
    }
    const status = statusFor(rawStatus);
    const firstPath = tokens[index + 1];
    if (firstPath === void 0) break;
    if (status === "renamed" || status === "copied") {
      const path = tokens[index + 2];
      if (path === void 0) break;
      changes.push({ status, path, previousPath: firstPath });
      index += 3;
      continue;
    }
    changes.push({ status, path: firstPath });
    index += 2;
  }
  return changes;
}
function sortCommitsChronologically(commits) {
  return [...commits].sort(
    (left, right) => left.committerTimestampMs - right.committerTimestampMs || (left.hash < right.hash ? -1 : left.hash > right.hash ? 1 : 0)
  );
}
function futureCommitWarnings(commits, analysisTimestampMs) {
  return sortCommitsChronologically(commits).filter((commit) => commit.committerTimestampMs > analysisTimestampMs).map((commit) => ({
    code: "future_commit",
    message: `Commit ${commit.hash} has a committer timestamp after analysis time.`
  }));
}
function emptyHistoryWarnings(commits) {
  return commits.length === 0 ? [
    {
      code: "empty_repository",
      message: "Repository has no commits; burst and consolidation history is unavailable."
    }
  ] : [];
}
function parseNonMergeGitLog(rawLog) {
  const commits = [];
  for (const record of rawLog.split(RECORD_SEPARATOR)) {
    if (!record) continue;
    const tokens = record.split("\0");
    const hash = tokens[0];
    const committerSeconds = Number(tokens[1]);
    if (!(hash && Number.isFinite(committerSeconds))) continue;
    commits.push({
      hash,
      committerTimestampMs: committerSeconds * 1e3,
      changes: parseChanges(tokens.slice(2))
    });
  }
  return sortCommitsChronologically(commits);
}
function pathExtension(path) {
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}
function normalizeExtensions(values) {
  const normalized = /* @__PURE__ */ new Set();
  for (const value of values) normalized.add(`.${value.replace(/^\./, "").toLowerCase()}`);
  return [...normalized];
}
function filterHistoryByExtensions(commits, extensions) {
  if (extensions.size === 0) {
    const included2 = [...commits];
    assertIncludedCommitLimit(included2.length);
    return included2;
  }
  const resolution = resolveLogicalActivities(commits);
  const selectedIdentities = new Set(
    resolution.activities.filter((activity) => extensions.has(pathExtension(activity.currentPath ?? activity.paths.at(-1) ?? ""))).map((activity) => activity.identity)
  );
  const included = commits.flatMap((commit) => {
    const changes = commit.changes.filter(
      (change) => selectedIdentities.has(resolution.identitiesByChange.get(change) ?? "")
    );
    return changes.length === 0 ? [] : [{ ...commit, changes }];
  });
  assertIncludedCommitLimit(included.length);
  return included;
}
function splitTemporalClusters(commits, gapMilliseconds) {
  if (gapMilliseconds < 0) throw new RangeError("gapMilliseconds must be nonnegative");
  const clusters = [];
  for (const commit of commits) {
    const current = clusters.at(-1);
    const previous = current?.at(-1);
    if (!(current && previous) || commit.committerTimestampMs - previous.committerTimestampMs > gapMilliseconds) {
      clusters.push([commit]);
      continue;
    }
    current.push(commit);
  }
  return clusters;
}
function fileIdentities(commits) {
  return resolveLogicalActivities(commits).identitiesByChange;
}
function commitFiles(commit, identities) {
  return new Set(commit.changes.map((change) => identities.get(change) ?? change.path));
}
function partitionQualifies(commits, identities) {
  return commits.length >= 5 && new Set(commits.flatMap((commit) => [...commitFiles(commit, identities)])).size >= 3;
}
function weightedSimilarity(commits, cut, identities) {
  const touchedByCommit = commits.map((commit) => commitFiles(commit, identities));
  const touches = /* @__PURE__ */ new Map();
  for (const files of touchedByCommit) {
    for (const file of files) touches.set(file, (touches.get(file) ?? 0) + 1);
  }
  const left = new Set(touchedByCommit.slice(cut - 5, cut).flatMap((files) => [...files]));
  const right = new Set(touchedByCommit.slice(cut, cut + 5).flatMap((files) => [...files]));
  const union = /* @__PURE__ */ new Set([...left, ...right]);
  if (union.size === 0) return 1;
  const weightFor = (file) => Math.log((1 + commits.length) / (1 + (touches.get(file) ?? 0))) + 1;
  const intersectionWeight = [...left].filter((file) => right.has(file)).reduce((total, file) => total + weightFor(file), 0);
  const unionWeight = [...union].reduce((total, file) => total + weightFor(file), 0);
  return intersectionWeight / unionWeight;
}
function selectChangePoint(commits, start, end, identities) {
  const candidates = [];
  for (let cut = start + 5; cut <= end - 5; cut += 1) {
    const left = commits.slice(start, cut);
    const right = commits.slice(cut, end);
    const gapMilliseconds = commits[cut].committerTimestampMs - commits[cut - 1].committerTimestampMs;
    if (gapMilliseconds < MIN_CHANGE_POINT_GAP_MS || !partitionQualifies(left, identities) || !partitionQualifies(right, identities))
      continue;
    const similarity = weightedSimilarity(commits, cut, identities);
    if (similarity <= MAX_CHANGE_POINT_SIMILARITY) candidates.push({ cut, gapMilliseconds, similarity });
  }
  return candidates.sort(
    (left, right) => left.similarity - right.similarity || right.gapMilliseconds - left.gapMilliseconds || left.cut - right.cut
  )[0];
}
function splitChangePoints(commits, start, end, identities) {
  const candidate = selectChangePoint(commits, start, end, identities);
  if (!candidate) return [commits.slice(start, end)];
  return [
    ...splitChangePoints(commits, start, candidate.cut, identities),
    ...splitChangePoints(commits, candidate.cut, end, identities)
  ];
}
function splitAtChangePoint(commits) {
  if (commits.length === 0) return [];
  return splitChangePoints(commits, 0, commits.length, fileIdentities(commits));
}
function retainQualifiedClosedClusters(clusters) {
  const identities = fileIdentities(clusters.flat());
  return clusters.filter((cluster) => partitionQualifies(cluster, identities)).map((cluster) => [...cluster]);
}
function retainClosedTemporalClusters(clusters, analysisTimestampMs, gapMilliseconds) {
  if (gapMilliseconds < 0) throw new RangeError("gapMilliseconds must be nonnegative");
  return clusters.filter((cluster) => {
    const newest = cluster.at(-1);
    return newest !== void 0 && !cluster.some((commit) => commit.committerTimestampMs > analysisTimestampMs) && analysisTimestampMs - newest.committerTimestampMs >= gapMilliseconds;
  }).map((cluster) => [...cluster]);
}
function maximumPostBurstCommits(files) {
  return Math.max(0, ...files.map((file) => file.postBurstCommits));
}
function selectSurvivors(files) {
  const maximum = maximumPostBurstCommits(files);
  return files.filter((file) => file.postBurstCommits >= 3 || maximum > 0 && file.postBurstCommits >= 0.2 * maximum);
}
function selectFossilCandidates(files) {
  const survivors = new Set(selectSurvivors(files));
  return files.filter((file) => file.existsAtHead && !survivors.has(file));
}
function selectDeletedNonSurvivorPaths(files) {
  const survivors = new Set(selectSurvivors(files));
  return files.filter((file) => !(file.existsAtHead || survivors.has(file))).map((file) => file.path);
}
function resolveLogicalActivities(commits) {
  const activeByPath = /* @__PURE__ */ new Map();
  const generationsByPath = /* @__PURE__ */ new Map();
  const identitiesByChange = /* @__PURE__ */ new Map();
  const states = /* @__PURE__ */ new Map();
  const createIdentity = (path) => {
    const generation = (generationsByPath.get(path) ?? 0) + 1;
    generationsByPath.set(path, generation);
    const identity = generation === 1 ? path : `${path}#${generation}`;
    states.set(identity, { identity, paths: [path], events: [], currentPath: path });
    activeByPath.set(path, identity);
    return identity;
  };
  const activeIdentity = (path) => activeByPath.get(path) ?? createIdentity(path);
  const record = (identity, change, commit) => {
    const state = states.get(identity);
    if (!state) throw new Error(`Missing logical identity: ${identity}`);
    state.events.push({ change, commit });
    identitiesByChange.set(change, identity);
    if (change.status === "renamed" && change.previousPath && state.paths.at(-1) !== change.previousPath)
      state.paths.push(change.previousPath);
    if (state.paths.at(-1) !== change.path) state.paths.push(change.path);
  };
  for (const commit of sortCommitsChronologically(commits)) {
    for (const change of commit.changes) {
      if (change.status === "renamed") {
        const sourcePath = change.previousPath ?? change.path;
        const identity2 = activeIdentity(sourcePath);
        activeByPath.delete(sourcePath);
        activeByPath.set(change.path, identity2);
        const state = states.get(identity2);
        if (state) state.currentPath = change.path;
        record(identity2, change, commit);
        continue;
      }
      if (change.status === "copied") {
        const identity2 = createIdentity(change.path);
        record(identity2, change, commit);
        continue;
      }
      if (change.status === "added") {
        const identity2 = createIdentity(change.path);
        record(identity2, change, commit);
        continue;
      }
      const identity = activeIdentity(change.path);
      record(identity, change, commit);
      if (change.status === "deleted") {
        activeByPath.delete(change.path);
        const state = states.get(identity);
        if (state) state.currentPath = void 0;
      }
    }
  }
  return {
    identitiesByChange,
    activities: [...states.values()].map((state) => {
      const timestamps = state.events.map(({ commit }) => commit.committerTimestampMs);
      return {
        identity: state.identity,
        currentPath: state.currentPath,
        paths: state.paths,
        firstCommitTimestampMs: Math.min(...timestamps),
        lastCommitTimestampMs: Math.max(...timestamps),
        commitCount: new Set(state.events.map(({ commit }) => commit.hash)).size,
        created: state.events.some(({ change }) => change.status === "added" || change.status === "copied"),
        deleted: state.currentPath === void 0,
        existsAtHead: state.currentPath !== void 0
      };
    })
  };
}
function resolveRenameActivities(commits) {
  return [...resolveLogicalActivities(commits).activities];
}
function assembleClosedBursts(fullChronologicalHistory, closedTemporalClusters) {
  const resolution = resolveLogicalActivities(fullChronologicalHistory);
  const activitiesByIdentity = new Map(resolution.activities.map((activity) => [activity.identity, activity]));
  const commitByHash = new Map(fullChronologicalHistory.map((commit) => [commit.hash, commit]));
  const commitIndexByHash = new Map(fullChronologicalHistory.map((commit, index) => [commit.hash, index]));
  const finalPartitions = closedTemporalClusters.flatMap((cluster) => splitAtChangePoint(cluster)).filter((partition) => partitionQualifies(partition, resolution.identitiesByChange));
  return finalPartitions.map((partition) => {
    const commits = partition.map((commit) => commitByHash.get(commit.hash) ?? commit);
    const identities = /* @__PURE__ */ new Map();
    for (const commit of commits) {
      for (const change of commit.changes) {
        const identity = resolution.identitiesByChange.get(change) ?? change.path;
        const changes = identities.get(identity) ?? [];
        changes.push(change);
        identities.set(identity, changes);
      }
    }
    const finalCommitIndex = Math.max(...commits.map((commit) => commitIndexByHash.get(commit.hash) ?? -1));
    const files = [...identities].map(([identity, changes]) => {
      const activity = activitiesByIdentity.get(identity);
      const postBurstCommits = new Set(
        fullChronologicalHistory.slice(finalCommitIndex + 1).filter(
          (commit) => commit.changes.some((change) => (resolution.identitiesByChange.get(change) ?? change.path) === identity)
        ).map((commit) => commit.hash)
      ).size;
      return {
        identity,
        path: activity?.currentPath ?? activity?.paths.at(-1) ?? changes.at(-1)?.path ?? identity,
        burstCommits: new Set(
          commits.filter(
            (commit) => commit.changes.some((change) => (resolution.identitiesByChange.get(change) ?? change.path) === identity)
          ).map((commit) => commit.hash)
        ).size,
        postBurstCommits,
        createdInBurst: changes.some((change) => change.status === "added" || change.status === "copied"),
        existsAtHead: activity?.existsAtHead ?? true
      };
    });
    const first = commits[0];
    const last = commits.at(-1);
    if (!(first && last)) throw new Error("Cannot assemble an empty burst");
    return {
      id: `burst-${first.hash}-${last.hash}`,
      startTimestampMs: first.committerTimestampMs,
      endTimestampMs: last.committerTimestampMs,
      commits,
      files,
      closed: true
    };
  });
}

// src/git-process.ts
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
var DEFAULT_GIT_INGESTION_LIMITS = {
  maximumStdoutBytes: 256 * 1024 * 1024,
  maximumStderrBytes: 1024 * 1024,
  maximumStatusRecords: 1e6
};
var SAFE_GIT_BASE_ARGUMENTS = ["--no-pager", "-c", "core.fsmonitor=false", "-c", "diff.external="];
function safeGitEnvironment(environment = process.env) {
  return { ...environment, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" };
}
var GitHistoryStatusCounter = class {
  #buffer = "";
  #state = "header";
  #remainingPaths = 0;
  #count = 0;
  get count() {
    return this.#count;
  }
  add(chunk) {
    this.#buffer += chunk;
    for (let separator = this.#buffer.indexOf("\0"); separator !== -1; separator = this.#buffer.indexOf("\0")) {
      const token = this.#buffer.slice(0, separator);
      this.#buffer = this.#buffer.slice(separator + 1);
      this.#consume(token);
    }
    return this.#count;
  }
  #consume(token) {
    if (token.startsWith("")) {
      this.#state = "timestamp";
      this.#remainingPaths = 0;
      return;
    }
    if (this.#state === "timestamp") {
      this.#state = "status";
      return;
    }
    if (this.#state === "path") {
      this.#remainingPaths -= 1;
      if (this.#remainingPaths === 0) this.#state = "status";
      return;
    }
    if (this.#state !== "status") return;
    const status = token.replace(/^\r?\n/, "");
    if (!/^[A-Z]\d*$/.test(status)) return;
    this.#count += 1;
    this.#remainingPaths = status[0] === "R" || status[0] === "C" ? 2 : 1;
    this.#state = "path";
  }
};
function collectBoundedGitOutput(child, { historyMode = false, limits: suppliedLimits = {} } = {}) {
  const limits = { ...DEFAULT_GIT_INGESTION_LIMITS, ...suppliedLimits };
  const stdout = child.stdout;
  const stderr = child.stderr;
  if (!(stdout && stderr)) return Promise.reject(new Error("Git child must use piped stdout and stderr."));
  return new Promise((resolvePromise, rejectPromise) => {
    const stdoutDecoder = new StringDecoder();
    const stderrDecoder = new StringDecoder();
    const statusCounter = new GitHistoryStatusCounter();
    const stdoutParts = [];
    const stderrParts = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const rejectLimit = (message) => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } finally {
        rejectPromise(new FossilAnalysisError({ code: "resource_limit", message }));
      }
    };
    stdout.on("data", (chunk) => {
      if (settled) return;
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > limits.maximumStdoutBytes) {
        rejectLimit("Git stdout limit exceeded.");
        return;
      }
      const text = stdoutDecoder.write(chunk);
      stdoutParts.push(text);
      if (historyMode && statusCounter.add(text) > limits.maximumStatusRecords)
        rejectLimit("Git status record limit exceeded.");
    });
    stderr.on("data", (chunk) => {
      if (settled) return;
      stderrBytes += chunk.byteLength;
      if (stderrBytes > limits.maximumStderrBytes) {
        rejectLimit("Git stderr limit exceeded.");
        return;
      }
      stderrParts.push(stderrDecoder.write(chunk));
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    });
    child.once("close", (exitCode) => {
      if (settled) return;
      const finalStdout = stdoutDecoder.end();
      const finalStderr = stderrDecoder.end();
      stdoutParts.push(finalStdout);
      stderrParts.push(finalStderr);
      if (historyMode && statusCounter.add(finalStdout) > limits.maximumStatusRecords) {
        rejectLimit("Git status record limit exceeded.");
        return;
      }
      settled = true;
      resolvePromise({
        exitCode,
        stdout: stdoutParts.join(""),
        stderr: stderrParts.join(""),
        stdoutBytes,
        stderrBytes,
        statusRecordCount: statusCounter.count
      });
    });
  });
}
function parseGitVersion(output) {
  const match = /^git version (\d+)\.(\d+)(?:\.\d+)?(?:[^\s]*)?\s*$/.exec(output);
  if (!(match?.[1] && match[2])) return void 0;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return Number.isSafeInteger(major) && Number.isSafeInteger(minor) ? { major, minor } : void 0;
}
function assertSupportedGitVersion(output) {
  const version = parseGitVersion(output);
  if (!(version && (version.major > 2 || version.major === 2 && version.minor >= 30)))
    throw new FossilAnalysisError({
      code: "git_capability",
      message: "Git 2.30 or newer is required for history analysis."
    });
  return version;
}
async function runGitCommand(arguments_, repositoryPath, input, historyMode = false) {
  const scopedArguments = repositoryPath === void 0 ? arguments_ : ["-C", repositoryPath, ...arguments_];
  const child = spawn("git", [...SAFE_GIT_BASE_ARGUMENTS, ...scopedArguments], {
    shell: false,
    windowsHide: true,
    env: safeGitEnvironment(),
    stdio: [input === void 0 ? "ignore" : "pipe", "pipe", "pipe"]
  });
  if (input !== void 0) child.stdin?.end(input);
  return collectBoundedGitOutput(child, { historyMode });
}

// src/reference-analysis-core.ts
import { posix } from "node:path";
var MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
var STATIC_IMPORT = /\bimport\s+(?:[^"'`;\r\n]*?\s+from\s+)?(["'])([^"'\r\n]+)\1/g;
var REQUIRE_CALL = /\brequire\s*\(\s*(["'])([^"'\r\n]+)\1\s*\)/g;
var DYNAMIC_IMPORT = /\bimport\s*\(\s*(["'])([^"'\r\n]+)\1\s*\)/g;
var CSHARP_USING = /^\s*using\s+(?!static\b)([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*;\s*$/gm;
var RUST_MODULE = /^\s*mod\s+([A-Za-z_]\w*)\s*;\s*$/gm;
var RUST_CRATE_USE = /^\s*use\s+crate::([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)\s*;\s*$/gm;
var DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES = 1048576;
var DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES = 268435456;
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function sourceSpan(content, start, end) {
  const lineStart = content.lastIndexOf("\n", start - 1) + 1;
  return {
    start,
    end,
    line: content.slice(0, start).split("\n").length,
    column: start - lineStart + 1
  };
}
function targetCandidates(sourcePath, specifier) {
  if (!(specifier.startsWith("./") || specifier.startsWith("../"))) return [specifier];
  const literal = posix.normalize(posix.join(posix.dirname(sourcePath), specifier));
  return [
    literal,
    ...MODULE_EXTENSIONS.map((extension) => `${literal}${extension}`),
    ...MODULE_EXTENSIONS.map((extension) => `${literal}/index${extension}`)
  ];
}
function parsedModuleReferences(source) {
  if (!(source.language === "typescript" || source.language === "javascript")) return [];
  const patterns = [
    ["import", STATIC_IMPORT],
    ["require", REQUIRE_CALL],
    ["dynamic-import", DYNAMIC_IMPORT]
  ];
  const references = [];
  for (const [kind, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(source.content); match; match = pattern.exec(source.content)) {
      const quote = match[1];
      const specifier = match[2];
      if (!(quote && specifier && match.index !== void 0)) continue;
      const start = match.index + match[0].lastIndexOf(`${quote}${specifier}${quote}`) + 1;
      const candidates = targetCandidates(source.path, specifier);
      references.push({
        sourcePath: source.path,
        targetCandidates: candidates,
        span: sourceSpan(source.content, start, start + specifier.length),
        language: source.language,
        kind,
        resolution: specifier.startsWith(".") ? "unresolved" : "external",
        strength: "strong"
      });
    }
  }
  return references.sort(
    (left, right) => compareText(left.sourcePath, right.sourcePath) || left.span.start - right.span.start || compareText(left.kind, right.kind)
  );
}
function braceDepthBefore(content, end) {
  let depth = 0;
  for (const character of content.slice(0, end)) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
  }
  return depth;
}
function parsedCsharpReferences(source, currentSources) {
  if (source.language !== "csharp") return [];
  const references = [];
  CSHARP_USING.lastIndex = 0;
  for (let match = CSHARP_USING.exec(source.content); match; match = CSHARP_USING.exec(source.content)) {
    const namespace = match[1];
    if (!(namespace && match.index !== void 0) || braceDepthBefore(source.content, match.index) > 1) continue;
    const suffix = `${namespace.replaceAll(".", "/")}.cs`;
    const matches = currentSources.filter((candidate) => candidate.language === "csharp" && candidate.path.endsWith(suffix)).map((candidate) => candidate.path).sort(compareText);
    const start = match.index + match[0].indexOf(namespace);
    references.push({
      sourcePath: source.path,
      targetCandidates: matches.length === 0 ? [suffix] : matches,
      targetPath: matches.length === 1 ? matches[0] : void 0,
      span: sourceSpan(source.content, start, start + namespace.length),
      language: "csharp",
      kind: "csharp-using",
      resolution: matches.length === 1 ? "resolved" : "unresolved",
      strength: "strong"
    });
  }
  return references;
}
function nearestCargoSourceRoot(path) {
  if (path.startsWith("src/")) return "src";
  const rootStart = path.lastIndexOf("/src/");
  return rootStart === -1 ? void 0 : path.slice(0, rootStart + 4);
}
function parsedRustReferences(source) {
  if (source.language !== "rust") return [];
  const patterns = [
    [
      "rust-mod",
      RUST_MODULE,
      (name) => {
        const sibling = posix.join(posix.dirname(source.path), name);
        return [`${sibling}.rs`, `${sibling}/mod.rs`];
      }
    ],
    [
      "rust-use",
      RUST_CRATE_USE,
      (name) => {
        const root = nearestCargoSourceRoot(source.path);
        const module = name.replaceAll("::", "/");
        return root ? [`${root}/${module}.rs`, `${root}/${module}/mod.rs`] : [];
      }
    ]
  ];
  const references = [];
  for (const [kind, pattern, candidatesFor] of patterns) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(source.content); match; match = pattern.exec(source.content)) {
      const name = match[1];
      if (!(name && match.index !== void 0)) continue;
      const start = match.index + match[0].indexOf(name);
      references.push({
        sourcePath: source.path,
        targetCandidates: candidatesFor(name),
        span: sourceSpan(source.content, start, start + name.length),
        language: "rust",
        kind,
        resolution: "unresolved",
        strength: "strong"
      });
    }
  }
  return references.sort((left, right) => left.span.start - right.span.start || compareText(left.kind, right.kind));
}
function tryCatchRanges(content) {
  const ranges = [];
  const stack = [];
  let pendingBody;
  let catchParameterDepth = 0;
  let quote = "";
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      let end = index + 1;
      while (/[\w$]/.test(content[end] ?? "")) end += 1;
      const word = content.slice(index, end);
      if (word === "try" || word === "catch") {
        pendingBody = word;
        catchParameterDepth = 0;
      }
      index = end - 1;
      continue;
    }
    if (pendingBody === "catch" && character === "(") {
      catchParameterDepth += 1;
      continue;
    }
    if (pendingBody === "catch" && character === ")" && catchParameterDepth > 0) {
      catchParameterDepth -= 1;
      continue;
    }
    if (character === "{") {
      const kind = pendingBody === "try" || pendingBody === "catch" && catchParameterDepth === 0;
      stack.push({ kind, start: index });
      if (kind) pendingBody = void 0;
    } else if (character === "}") {
      const opened = stack.pop();
      if (opened?.kind) ranges.push([opened.start, index]);
    }
  }
  return ranges;
}
function syntaxView(content) {
  const characters = content.split("");
  const comments = [];
  let quote = "";
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];
    if (quote) {
      characters[index] = " ";
      if (character === "\\") {
        characters[index + 1] = " ";
        index += 1;
      } else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      characters[index] = " ";
      continue;
    }
    if (character !== "/" || !(next === "/" || next === "*")) continue;
    const start = index;
    const lineComment = next === "/";
    index += 2;
    while (index < content.length && (lineComment ? content[index] !== "\n" : !(content[index] === "*" && content[index + 1] === "/"))) {
      index += 1;
    }
    const end = lineComment ? index : Math.min(content.length, index + 2);
    comments.push({ start, end, text: content.slice(start, end) });
    for (let offset = start; offset < end; offset += 1) {
      if (characters[offset] !== "\n") characters[offset] = " ";
    }
    index = end - 1;
  }
  return { code: characters.join(""), comments };
}
function hasFallbackToken(text) {
  return /\b(?:fallback|legacy|old|default)\b/i.test(text);
}
function balancedClose(code, open, opening, closing) {
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === opening) depth += 1;
    if (code[index] === closing && --depth === 0) return index;
  }
  return void 0;
}
function nextNonWhitespace(code, start) {
  let index = start;
  while (/\s/.test(code[index] ?? "")) index += 1;
  return index;
}
function hasLeadingFallbackComment(view, position) {
  return view.comments.some(
    (comment) => comment.end <= position && /^\s*$/.test(view.code.slice(comment.end, position)) && hasFallbackToken(comment.text)
  );
}
function conditionalFallbackRanges(view) {
  const ranges = [];
  const matcher = /\bif\b/g;
  for (let match = matcher.exec(view.code); match; match = matcher.exec(view.code)) {
    const conditionOpen = nextNonWhitespace(view.code, (match.index ?? 0) + match[0].length);
    if (view.code[conditionOpen] !== "(") continue;
    const conditionClose = balancedClose(view.code, conditionOpen, "(", ")");
    if (conditionClose === void 0) continue;
    const bodyOpen = nextNonWhitespace(view.code, conditionClose + 1);
    if (view.code[bodyOpen] !== "{") continue;
    const bodyClose = balancedClose(view.code, bodyOpen, "{", "}");
    if (bodyClose === void 0) continue;
    const fallbackIf = hasFallbackToken(view.code.slice(conditionOpen + 1, conditionClose)) || hasLeadingFallbackComment(view, match.index ?? 0);
    if (fallbackIf) ranges.push([bodyOpen, bodyClose]);
    const elseStart = nextNonWhitespace(view.code, bodyClose + 1);
    if (view.code.slice(elseStart, elseStart + 4) !== "else") continue;
    const elseBodyOpen = nextNonWhitespace(view.code, elseStart + 4);
    if (view.code[elseBodyOpen] !== "{") continue;
    const elseBodyClose = balancedClose(view.code, elseBodyOpen, "{", "}");
    if (elseBodyClose !== void 0 && (fallbackIf || hasLeadingFallbackComment(view, elseStart)))
      ranges.push([elseBodyOpen, elseBodyClose]);
  }
  return ranges;
}
function fallbackOperandRanges(code) {
  const ranges = [];
  const matcher = /\|\||\?\?/g;
  for (let match = matcher.exec(code); match; match = matcher.exec(code)) {
    const start = nextNonWhitespace(code, (match.index ?? 0) + match[0].length);
    let parentheses = 0;
    let brackets = 0;
    let braces = 0;
    let end = start;
    for (; end < code.length; end += 1) {
      const character = code[end];
      if (character === "(") parentheses += 1;
      else if (character === ")" && parentheses-- === 0) break;
      else if (character === "[") brackets += 1;
      else if (character === "]" && brackets-- === 0) break;
      else if (character === "{") braces += 1;
      else if (character === "}" && braces-- === 0) break;
      else if (parentheses === 0 && brackets === 0 && braces === 0 && (character === ";" || character === "," || character === "\n"))
        break;
    }
    if (end > start) ranges.push([start - 1, end]);
  }
  return ranges;
}
function localImportBindings(declaration) {
  const bindings = /* @__PURE__ */ new Set();
  const add = (binding) => {
    if (binding && /^[A-Za-z_$][\w$]*$/.test(binding)) bindings.add(binding);
  };
  const defaultBinding = /^\s*import\s+([A-Za-z_$][\w$]*)\s*(?:,|from\b)/.exec(declaration)?.[1];
  add(defaultBinding);
  add(/\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(declaration)?.[1]);
  const namedBindings = /\{([^}]*)\}/.exec(declaration)?.[1];
  for (const namedBinding of namedBindings?.split(",") ?? []) {
    const [imported, local] = namedBinding.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
    add(local ?? imported);
  }
  return [...bindings];
}
function declarationRange(content, position) {
  const start = content.lastIndexOf("\n", position) + 1;
  const nextNewline = content.indexOf("\n", position);
  return [start, nextNewline === -1 ? content.length : nextNewline];
}
function csharpGuardRanges(view) {
  const ranges = [];
  const starts = [];
  const directives = /^\s*#(if|endif)\b.*$/gm;
  for (let match = directives.exec(view.code); match; match = directives.exec(view.code)) {
    if (match[1] === "if") starts.push(match.index ?? 0);
    else {
      const start = starts.pop();
      if (start !== void 0) ranges.push([start, (match.index ?? 0) + match[0].length]);
    }
  }
  return ranges;
}
function rustGuardRanges(view) {
  const ranges = [];
  const attributes = /#\s*\[\s*cfg\s*\(/g;
  for (let match = attributes.exec(view.code); match; match = attributes.exec(view.code)) {
    const attributeStart = match.index ?? 0;
    const conditionOpen = view.code.indexOf("(", attributeStart);
    const conditionClose = balancedClose(view.code, conditionOpen, "(", ")");
    if (conditionClose === void 0) continue;
    const attributeEnd = nextNonWhitespace(view.code, conditionClose + 1);
    if (view.code[attributeEnd] !== "]") continue;
    const itemStart = nextNonWhitespace(view.code, attributeEnd + 1);
    let delimiter = itemStart;
    while (delimiter < view.code.length && view.code[delimiter] !== "{" && view.code[delimiter] !== ";") delimiter += 1;
    if (view.code[delimiter] === "{") {
      const itemEnd = balancedClose(view.code, delimiter, "{", "}");
      if (itemEnd !== void 0) ranges.push([itemStart, itemEnd]);
    } else if (view.code[delimiter] === ";") ranges.push([itemStart, delimiter]);
  }
  return ranges;
}
function guardSymbol(reference, source) {
  const declared = source.content.slice(reference.span.start, reference.span.end);
  const separator = reference.kind === "csharp-using" ? "." : "::";
  return declared.split(separator).at(-1) ?? (reference.targetPath ?? reference.targetCandidates[0] ?? "").split(/[/.]/).at(-2) ?? "";
}
function strengthForReference(reference, sources) {
  const source = sources.find((candidate) => candidate.path === reference.sourcePath);
  if (!source) return "strong";
  if (reference.kind === "csharp-using" || reference.kind === "rust-mod" || reference.kind === "rust-use") {
    const symbol = guardSymbol(reference, source);
    const view2 = syntaxView(source.content);
    const [declarationStart2, declarationEnd2] = declarationRange(source.content, reference.span.start);
    const uses2 = [...source.content.matchAll(new RegExp(`\\b${symbol}\\b`, "g"))].map((match) => match.index ?? -1).filter(
      (index) => (index < declarationStart2 || index >= declarationEnd2) && view2.code[index] === source.content[index]
    );
    const guards = reference.kind === "csharp-using" ? csharpGuardRanges(view2) : rustGuardRanges(view2);
    return uses2.length > 0 && uses2.every((index) => guards.some(([start, end]) => index > start && index < end)) ? "weak" : "strong";
  }
  if (reference.kind !== "import") return "strong";
  const declarationStart = source.content.lastIndexOf("import", reference.span.start);
  const semicolon = source.content.indexOf(";", reference.span.end);
  const newline = source.content.indexOf("\n", reference.span.end);
  const declarationEnd = semicolon === -1 ? newline : newline === -1 ? semicolon : Math.min(semicolon, newline);
  const declaration = source.content.slice(declarationStart, declarationEnd + 1);
  const bindings = localImportBindings(declaration);
  if (bindings.length === 0) return "strong";
  const view = syntaxView(source.content);
  const uses = bindings.flatMap(
    (binding) => [
      ...source.content.matchAll(
        new RegExp(`(^|[^A-Za-z0-9_$])(${binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![A-Za-z0-9_$])`, "g")
      )
    ].map((match) => (match.index ?? -1) + (match[1]?.length ?? 0)).filter(
      (index) => (index < declarationStart || index > declarationEnd) && view.code[index] === source.content[index]
    )
  );
  const regions = [
    ...tryCatchRanges(source.content),
    ...conditionalFallbackRanges(view),
    ...fallbackOperandRanges(view.code)
  ];
  return uses.length > 0 && uses.every((index) => regions.some(([start, end]) => index > start && index < end)) ? "weak" : "strong";
}
function referenceGraph(parsed, sources) {
  const paths = new Set(sources.map((source) => source.path));
  const resolved = parsed.map((reference) => ({
    reference,
    targetPath: reference.targetPath ?? (reference.language === "csharp" ? void 0 : reference.targetCandidates.find((candidate) => paths.has(candidate)))
  }));
  const edges = resolved.filter((entry) => entry.targetPath !== void 0).map(({ reference, targetPath }) => ({
    sourcePath: reference.sourcePath,
    targetPath: targetPath ?? "",
    language: reference.language,
    kind: reference.kind,
    strength: strengthForReference(reference, sources),
    span: reference.span
  }));
  const unresolved = resolved.filter((entry) => entry.targetPath === void 0).map(({ reference: { sourcePath, targetCandidates: candidates, language, kind, span, resolution } }) => ({
    sourcePath,
    targetCandidates: candidates,
    language,
    kind,
    span,
    resolution: resolution === "external" ? "external" : "unresolved"
  }));
  return { edges, unresolved, complete: true, unavailablePaths: [] };
}
function analyzeReferences(sources) {
  return referenceGraph(
    sources.flatMap((source) => [
      ...parsedModuleReferences(source),
      ...parsedCsharpReferences(source, sources),
      ...parsedRustReferences(source)
    ]),
    sources
  );
}
function regradeVestigialEdges(graph, candidatePaths) {
  return {
    ...graph,
    edges: graph.edges.map(
      (edge) => candidatePaths.has(edge.sourcePath) && candidatePaths.has(edge.targetPath) ? { ...edge, strength: "vestigial" } : { ...edge }
    )
  };
}
function markUnresolvedCandidateEvidence(graph, candidatePaths) {
  const normalize = (path) => path.replaceAll("\\", "/").replace(/\/(?:index)(?:\.[^/]+)?$/, "").replace(/\.[^/]+$/, "");
  const candidates = [...candidatePaths];
  const basenameCounts = /* @__PURE__ */ new Map();
  for (const path of candidates) {
    const basename2 = normalize(path).split("/").at(-1) ?? "";
    basenameCounts.set(basename2, (basenameCounts.get(basename2) ?? 0) + 1);
  }
  const unavailable = new Set(graph.unavailablePaths);
  for (const unresolved of graph.unresolved) {
    if (unresolved.resolution !== "unresolved") continue;
    for (const target of unresolved.targetCandidates) {
      const normalizedTarget = normalize(target);
      if (!normalizedTarget) continue;
      const basename2 = normalizedTarget.split("/").at(-1) ?? "";
      for (const candidate of candidates) {
        const normalizedCandidate = normalize(candidate);
        const relevant = normalizedTarget.includes("/") ? normalizedCandidate === normalizedTarget || normalizedCandidate.endsWith(`/${normalizedTarget}`) : normalizedCandidate === normalizedTarget || basenameCounts.get(basename2) === 1 && normalizedCandidate.endsWith(`/${basename2}`);
        if (relevant) unavailable.add(candidate);
      }
    }
  }
  const unavailablePaths = [...unavailable].sort(compareText);
  return { ...graph, complete: graph.complete && unavailablePaths.length === 0, unavailablePaths };
}
function unsupportedCandidateReferenceGraph(candidates) {
  const unavailablePaths = [
    ...new Set(
      candidates.filter((candidate) => candidate.language === "unsupported").map((candidate) => candidate.path)
    )
  ].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return {
    edges: [],
    unresolved: [],
    complete: unavailablePaths.length === 0,
    unavailablePaths
  };
}
function readStableReferenceSources(sources, boundary, maximumFileBytes = DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES, maximumTotalBytes = DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES) {
  const readableSources = [];
  const unavailablePaths = [];
  const warnings = [];
  let acceptedBytes = 0;
  let totalLimitReached = false;
  const addWarning = (source, code, message) => {
    unavailablePaths.push(source.path);
    warnings.push({ code, message, path: source.path });
  };
  for (const source of sources) {
    if (totalLimitReached || acceptedBytes >= maximumTotalBytes) {
      addWarning(source, "reference_content_limit", "Reference source exceeds the total content limit.");
      continue;
    }
    let initial;
    try {
      initial = boundary.inspect(source);
    } catch {
      addWarning(source, "reference_unreadable", "Reference source could not be read.");
      continue;
    }
    if (!initial?.isRegularFile) {
      addWarning(source, "reference_unreadable", "Reference source could not be read.");
      continue;
    }
    if (initial.byteLength > maximumFileBytes) {
      addWarning(source, "reference_content_limit", "Reference source exceeds the per-file content limit.");
      continue;
    }
    if (acceptedBytes + initial.byteLength > maximumTotalBytes) {
      addWarning(source, "reference_content_limit", "Reference source exceeds the total content limit.");
      totalLimitReached = true;
      continue;
    }
    let current;
    try {
      current = boundary.inspect(source);
    } catch {
      addWarning(source, "reference_unreadable", "Reference source could not be read.");
      continue;
    }
    if (!current) {
      addWarning(source, "reference_unreadable", "Reference source could not be read.");
      continue;
    }
    if (current.identity !== initial.identity || current.isRegularFile !== initial.isRegularFile || current.byteLength !== initial.byteLength || current.canonicalPath !== initial.canonicalPath) {
      addWarning(source, "reference_path_changed", "Reference source changed during scanning.");
      continue;
    }
    try {
      const content = boundary.read(source);
      if (content.includes("\0")) {
        addWarning(source, "reference_binary", "Reference source is binary.");
        continue;
      }
      readableSources.push({ ...source, content });
      acceptedBytes += initial.byteLength;
    } catch {
      addWarning(source, "reference_unreadable", "Reference source could not be read.");
    }
  }
  unavailablePaths.sort(compareText);
  warnings.sort((left, right) => compareText(left.path ?? "", right.path ?? ""));
  return {
    graph: {
      edges: [],
      unresolved: [],
      complete: unavailablePaths.length === 0,
      unavailablePaths
    },
    sources: readableSources,
    warnings,
    acceptedBytes
  };
}

// src/workspace-debris.ts
import { posix as posix2 } from "node:path";
var UNTRACKED_DISCOVERY_ARGUMENTS = ["ls-files", "-z", "--others", "--exclude-standard"];
var IGNORED_DISCOVERY_ARGUMENTS = ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"];
var CHECK_IGNORE_ARGUMENTS = ["check-ignore", "-z", "-v", "--stdin"];
var DEPENDENCY_STORE_SEGMENTS = /* @__PURE__ */ new Set(["node_modules", "vendor", ".pnpm-store", ".yarn", ".cargo"]);
var SENSITIVE_DIRECTORY_SEGMENTS = /* @__PURE__ */ new Set([".aws", ".ssh", ".gnupg", ".kube"]);
var SENSITIVE_BASENAMES = /* @__PURE__ */ new Set([".env", ".npmrc", ".pypirc", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]);
var SENSITIVE_EXTENSIONS = [".pem", ".key", ".p12", ".pfx", ".crt", ".cer", ".kdbx"];
var MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH = 256;
var MAXIMUM_CALLER_EXCLUSION_GLOBS = 64;
var MAXIMUM_CALLER_EXCLUSION_GLOB_BYTES = 4096;
function parseNulDelimitedPaths(output) {
  return output.split("\0").filter((path) => path !== "");
}
function normalizePath(path) {
  return path.replaceAll("\\", "/");
}
function isDependencyStorePath(path) {
  return normalizePath(path).split("/").some((segment) => DEPENDENCY_STORE_SEGMENTS.has(segment));
}
function isSensitiveWorkspacePath(path) {
  const segments = normalizePath(path).split("/").map((segment) => segment.toLowerCase());
  const name = segments.at(-1) ?? "";
  return segments.some((segment) => SENSITIVE_DIRECTORY_SEGMENTS.has(segment)) || SENSITIVE_BASENAMES.has(name) || name.startsWith(".env.") || name.startsWith("credentials") || SENSITIVE_EXTENSIONS.some((extension) => name.endsWith(extension));
}
function callerGlobMatches(path, pattern) {
  const normalizedPattern = normalizePath(pattern);
  if (normalizedPattern.length === 0 || normalizedPattern.length > MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH) return false;
  let previous = Array(path.length + 1).fill(false);
  previous[0] = true;
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];
    const recursiveWildcard = character === "*" && normalizedPattern[index + 1] === "*";
    if (recursiveWildcard) index += 1;
    const current = Array(path.length + 1).fill(false);
    for (let pathIndex = 0; pathIndex <= path.length; pathIndex += 1) {
      if (character === "*") {
        current[pathIndex] = previous[pathIndex] || pathIndex > 0 && (recursiveWildcard || path[pathIndex - 1] !== "/") && current[pathIndex - 1];
      } else if (pathIndex > 0 && character === "?")
        current[pathIndex] = path[pathIndex - 1] !== "/" && previous[pathIndex - 1];
      else if (pathIndex > 0) current[pathIndex] = character === path[pathIndex - 1] && previous[pathIndex - 1];
    }
    previous = current;
  }
  return previous[path.length];
}
function callerExclusionPatterns(patterns) {
  const accepted = [];
  let byteLength = 0;
  for (const pattern of patterns) {
    const normalized = normalizePath(pattern);
    if (accepted.length >= MAXIMUM_CALLER_EXCLUSION_GLOBS || normalized.length === 0 || normalized.length > MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH || byteLength + normalized.length > MAXIMUM_CALLER_EXCLUSION_GLOB_BYTES || normalized.includes("\0") || normalized.startsWith("/") || normalized.split("/").includes(".."))
      continue;
    accepted.push(normalized);
    byteLength += normalized.length;
  }
  return accepted;
}
function filterWorkspaceDiscoveryPaths(paths, excludePatterns) {
  const acceptedPatterns = callerExclusionPatterns(excludePatterns);
  return paths.map(normalizePath).filter((path) => !acceptedPatterns.some((pattern) => callerGlobMatches(path, pattern)));
}
function inspectWorkspaceFileMetadataWithWarnings(paths, readMetadata, excludePatterns = []) {
  const metadata = [];
  const warnings = [];
  for (const normalizedPath2 of filterWorkspaceDiscoveryPaths(paths, excludePatterns)) {
    if (isDependencyStorePath(normalizedPath2) || isSensitiveWorkspacePath(normalizedPath2)) continue;
    try {
      const file = readMetadata(normalizedPath2);
      if (file.isSymbolicLink || file.isJunction) continue;
      metadata.push({ ...file, path: normalizedPath2 });
    } catch {
      warnings.push({
        code: "workspace_unreadable",
        message: "Workspace path could not be inspected.",
        path: normalizedPath2
      });
    }
  }
  warnings.sort((left, right) => {
    const leftPath = left.path ?? "";
    const rightPath = right.path ?? "";
    return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
  });
  return { metadata, warnings };
}
function classifyIgnoreSource(sourcePath, globalExcludePath) {
  const normalizedSource = normalizePath(sourcePath);
  if (normalizedSource === ".git/info/exclude" || normalizedSource.endsWith("/.git/info/exclude"))
    return "local-exclude";
  if (globalExcludePath && normalizePath(globalExcludePath) === normalizedSource) return "global-exclude";
  if (!(normalizedSource.startsWith("/") || /^[A-Za-z]:\//.test(normalizedSource))) return "repository";
  return "unknown";
}
function parseVerboseCheckIgnore(output, globalExcludePath) {
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const provenance = [];
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const sourcePath = fields[index];
    const rule = fields[index + 2];
    const path = fields[index + 3];
    if (!(sourcePath && rule !== void 0 && path !== void 0)) continue;
    provenance.push({ path, rule, source: classifyIgnoreSource(sourcePath, globalExcludePath) });
  }
  return provenance;
}
function oldUntrackedWorkspaceCandidates(files, analysisTimestampMs, minimumAgeDays) {
  const cutoffTimestampMs = analysisTimestampMs - minimumAgeDays * 24 * 60 * 60 * 1e3;
  return files.filter((file) => file.isRegularFile && file.modifiedTimestampMs <= cutoffTimestampMs).map(({ path, modifiedTimestampMs }) => ({ path, kind: "untracked", modifiedTimestampMs }));
}
function oldIgnoredWorkspaceCandidates(files, provenance, analysisTimestampMs, minimumAgeDays) {
  const provenanceByPath = new Map(provenance.map((entry) => [entry.path, entry]));
  const cutoffTimestampMs = analysisTimestampMs - minimumAgeDays * 24 * 60 * 60 * 1e3;
  return files.flatMap((file) => {
    const ignore = provenanceByPath.get(file.path);
    if (!(file.isRegularFile && file.modifiedTimestampMs <= cutoffTimestampMs && ignore)) return [];
    return [
      {
        path: file.path,
        kind: "ignored",
        modifiedTimestampMs: file.modifiedTimestampMs,
        ignore: { rule: ignore.rule, source: ignore.source }
      }
    ];
  });
}
function normalizedRepositoryPath(path) {
  return posix2.normalize(path.replaceAll("\\", "/")).replace(/^\.\//, "");
}
function basename(path) {
  return normalizedRepositoryPath(path).split("/").at(-1) ?? "";
}
function sourceStringValues(content) {
  const values = [];
  const matcher = /(["'`])([^"'`\r\n]+)\1/g;
  for (let match = matcher.exec(content); match; match = matcher.exec(content)) {
    const value = match[2];
    if (value !== void 0) values.push(normalizedRepositoryPath(value));
  }
  return values;
}
function hasInboundWorkspaceUsage(candidatePath, sources, inventoryPaths) {
  const normalizedCandidate = normalizedRepositoryPath(candidatePath);
  const graph = analyzeReferences(sources);
  if (graph.edges.some(
    (edge) => normalizedRepositoryPath(edge.targetPath) === normalizedCandidate && normalizedRepositoryPath(edge.sourcePath) !== normalizedCandidate
  ))
    return true;
  const candidateBasename = basename(normalizedCandidate);
  const normalizedInventory = new Set([...inventoryPaths, candidatePath].map(normalizedRepositoryPath));
  const basenameCount = [...normalizedInventory].filter((path) => basename(path) === candidateBasename).length;
  return sources.some((source) => {
    if (normalizedRepositoryPath(source.path) === normalizedCandidate) return false;
    return sourceStringValues(source.content).some(
      (value) => value === normalizedCandidate || basenameCount === 1 && value === candidateBasename
    );
  });
}
function workspaceDebrisFinding(candidate, sources, inventoryPaths, analysisBoundary, unobservedMechanisms) {
  if (hasInboundWorkspaceUsage(candidate.path, sources, inventoryPaths)) return void 0;
  return {
    classification: "advisory",
    review: "possible workspace debris",
    path: candidate.path,
    kind: candidate.kind,
    modifiedTimestampMs: candidate.modifiedTimestampMs,
    ageSource: "mtime",
    ageUncertainty: "Modification time is filesystem metadata. Copying, restoring, extracting, or rebuilding can change it.",
    ignore: "ignore" in candidate ? candidate.ignore : void 0,
    detectedReferenceEvidence: [],
    analysisBoundary,
    unobservedReferenceMechanisms: unobservedMechanisms
  };
}

// src/repository-analysis.ts
var MEBIBYTE = 1024 * 1024;
function languageForPath(path) {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if ([".ts", ".tsx"].includes(extension)) return "typescript";
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension)) return "javascript";
  if (extension === ".cs") return "csharp";
  if (extension === ".rs") return "rust";
  return "unsupported";
}
function gitFailure(message) {
  return new FossilAnalysisError({ code: "git_failure", message });
}
function emptyHistoryOutput() {
  return { exitCode: 0, stdout: "", stderr: "", stdoutBytes: 0, stderrBytes: 0, statusRecordCount: 0 };
}
async function successfulGit(runGit, arguments_, repositoryPath, input, historyMode = false) {
  let result;
  try {
    result = await runGit(arguments_, repositoryPath, input, historyMode);
  } catch {
    throw gitFailure("Git command could not be started or read.");
  }
  if (result.exitCode === 0) return result;
  throw gitFailure("Git command failed during repository analysis.");
}
function referenceSources(root, paths) {
  const candidates = paths.map((path) => ({ path, language: languageForPath(path) }));
  const supported = candidates.filter((candidate) => candidate.language !== "unsupported");
  const reads = readStableReferenceSources(supported, {
    inspect(source) {
      const fullPath = join(root, source.path);
      const metadata = lstatSync(fullPath);
      return {
        identity: `${metadata.dev}:${metadata.ino}`,
        isRegularFile: metadata.isFile(),
        byteLength: metadata.size,
        canonicalPath: realpathSync(fullPath)
      };
    },
    read(source) {
      return readFileSync(join(root, source.path), "utf8");
    }
  });
  const unsupported = unsupportedCandidateReferenceGraph(candidates);
  const graph = analyzeReferences(reads.sources);
  return {
    sources: reads.sources,
    warnings: reads.warnings,
    acceptedBytes: reads.acceptedBytes,
    graph: {
      ...graph,
      complete: reads.graph.complete && unsupported.complete,
      unavailablePaths: [.../* @__PURE__ */ new Set([...reads.graph.unavailablePaths, ...unsupported.unavailablePaths])].sort()
    }
  };
}
async function analyzeRepositoryCore(repositoryPath, options, runGit = runGitCommand) {
  const version = await successfulGit(runGit, ["--version"]);
  assertSupportedGitVersion(version.stdout);
  const discovery = await runGit(["rev-parse", "--show-toplevel"], repositoryPath);
  if (discovery.exitCode !== 0)
    throw new FossilAnalysisError({ code: "not_repository", message: "Not a Git repository." });
  const prefix = await successfulGit(runGit, ["rev-parse", "--show-prefix"], repositoryPath);
  const root = resolve(
    realpathSync(repositoryPath),
    ...prefix.stdout.trim().split("/").filter(Boolean).map(() => "..")
  );
  const analysisTimestampMs = Date.now();
  const head = await runGit(["rev-parse", "--verify", "HEAD"], root);
  const historyOutput = head.exitCode === 0 ? await successfulGit(runGit, nonMergeGitLogArguments(), root, void 0, true) : emptyHistoryOutput();
  const parsedHistory = parseNonMergeGitLog(historyOutput.stdout);
  const minimumTimestamp = analysisTimestampMs - options.days * 24 * 60 * 60 * 1e3;
  const includedHistory = filterHistoryByExtensions(
    parsedHistory.filter((commit) => commit.committerTimestampMs >= minimumTimestamp),
    new Set(normalizeExtensions(options.extensions))
  );
  const shallow = await successfulGit(runGit, shallowRepositoryArguments(), root);
  const sparse = await successfulGit(runGit, sparseCheckoutArguments(), root).catch((error) => {
    if (error instanceof FossilAnalysisError) return { stdout: "", stdoutBytes: 0, stderrBytes: 0 };
    throw error;
  });
  const submodules = await successfulGit(runGit, ["submodule", "status", "--recursive"], root);
  const warnings = [
    ...emptyHistoryWarnings(includedHistory),
    ...futureCommitWarnings(includedHistory, analysisTimestampMs),
    ...shallowHistoryWarnings(shallow.stdout),
    ...sparseCheckoutWarnings(sparse.stdout),
    ...submodules.stdout.trim() === "" ? [] : [{ code: "submodule_omitted", message: "Submodule contents are omitted from repository analysis." }]
  ];
  const bursts = assembleClosedBursts(
    includedHistory,
    retainQualifiedClosedClusters(
      retainClosedTemporalClusters(
        splitTemporalClusters(includedHistory, options.gapHours * 60 * 60 * 1e3),
        analysisTimestampMs,
        options.gapHours * 60 * 60 * 1e3
      )
    )
  );
  const trackedOutput = await successfulGit(runGit, ["ls-files", "-z"], root);
  const untrackedOutput = await successfulGit(runGit, UNTRACKED_DISCOVERY_ARGUMENTS, root);
  const ignoredOutput = await successfulGit(runGit, IGNORED_DISCOVERY_ARGUMENTS, root);
  const untracked = parseNulDelimitedPaths(untrackedOutput.stdout);
  const ignored = parseNulDelimitedPaths(ignoredOutput.stdout);
  const inspect = (path) => {
    const metadata = lstatSync(join(root, path));
    return {
      path,
      isRegularFile: metadata.isFile(),
      isSymbolicLink: metadata.isSymbolicLink(),
      modifiedTimestampMs: metadata.mtimeMs
    };
  };
  const untrackedMetadata = inspectWorkspaceFileMetadataWithWarnings(untracked, inspect, options.exclude);
  const ignoredMetadata = inspectWorkspaceFileMetadataWithWarnings(ignored, inspect, options.exclude);
  warnings.push(...untrackedMetadata.warnings, ...ignoredMetadata.warnings);
  const filteredIgnored = filterWorkspaceDiscoveryPaths(ignored, options.exclude);
  const ignoreOutput = filteredIgnored.length === 0 ? void 0 : await successfulGit(runGit, CHECK_IGNORE_ARGUMENTS, root, `${filteredIgnored.join("\0")}\0`);
  const ignoredProvenance = parseVerboseCheckIgnore(ignoreOutput?.stdout ?? "");
  const workspaceCandidates = [
    ...oldUntrackedWorkspaceCandidates(untrackedMetadata.metadata, analysisTimestampMs, options.untrackedAgeDays),
    ...oldIgnoredWorkspaceCandidates(
      ignoredMetadata.metadata,
      ignoredProvenance,
      analysisTimestampMs,
      options.untrackedAgeDays
    )
  ];
  const inventory = [
    .../* @__PURE__ */ new Set([...parseNulDelimitedPaths(trackedOutput.stdout), ...workspaceCandidates.map(({ path }) => path)])
  ].sort();
  if (inventory.length > 1e5)
    throw new FossilAnalysisError({ code: "resource_limit", message: "File inventory limit exceeded." });
  const references = referenceSources(root, inventory);
  warnings.push(...references.warnings);
  const reports = bursts.map((burst) => {
    const candidates = selectFossilCandidates(burst.files);
    const candidatePaths = new Set(candidates.map((candidate) => candidate.path));
    const graph = markUnresolvedCandidateEvidence(
      regradeVestigialEdges(references.graph, candidatePaths),
      candidatePaths
    );
    const findings = candidates.flatMap((candidate) => {
      const reference = candidateReferenceSubscores(candidate.path, graph, candidatePaths);
      const score = scoreFossilSubscores({
        churn: normalizedBurstChurn(candidate, burst.files),
        abandonment: abandonmentScore(candidate),
        ...reference.available ? { referenceWeakness: reference.referenceWeakness, clusterIsolation: reference.clusterIsolation } : {}
      });
      if (!(score && score.score >= options.threshold)) return [];
      const inbound = new Set(
        graph.edges.filter(
          (edge) => edge.targetPath === candidate.path && edge.strength === "strong" && !candidatePaths.has(edge.sourcePath)
        ).map((edge) => edge.sourcePath)
      );
      const neighbors = new Set(
        graph.edges.flatMap(
          (edge) => edge.sourcePath === candidate.path ? [edge.targetPath] : edge.targetPath === candidate.path ? [edge.sourcePath] : []
        )
      );
      return [
        createAdvisoryFossilFinding({
          burstId: burst.id,
          path: candidate.path,
          activity: candidate,
          score: score.score,
          scoreBasis: score.basis,
          subscores: {
            churn: normalizedBurstChurn(candidate, burst.files),
            abandonment: abandonmentScore(candidate),
            ...reference.available ? { referenceWeakness: reference.referenceWeakness, clusterIsolation: reference.clusterIsolation } : {}
          },
          referenceAvailability: reference.available ? "complete" : "unavailable",
          strongInboundReferences: inbound.size,
          candidateNeighbors: [...neighbors].filter((path) => candidatePaths.has(path)).sort(),
          liveNeighbors: [...neighbors].filter((path) => !candidatePaths.has(path)).sort()
        })
      ];
    });
    return {
      id: burst.id,
      startTimestampMs: burst.startTimestampMs,
      endTimestampMs: burst.endTimestampMs,
      commitCount: burst.commits.length,
      fileCount: burst.files.length,
      survivors: selectSurvivors(burst.files),
      findings,
      deletedPaths: selectDeletedNonSurvivorPaths(burst.files)
    };
  });
  const workspaceDebris = workspaceCandidates.flatMap((candidate) => {
    const finding = workspaceDebrisFinding(candidate, references.sources, inventory, root, [
      "dynamic runtime loading",
      "reflection",
      "external consumers",
      "generated configuration"
    ]);
    return finding ? [finding] : [];
  });
  const gitOutputs = [
    version,
    discovery,
    prefix,
    head,
    historyOutput,
    shallow,
    sparse,
    submodules,
    trackedOutput,
    untrackedOutput,
    ignoredOutput,
    ignoreOutput
  ].filter((output) => output !== void 0);
  return finalizeFossilReport({
    schemaVersion: 1,
    options,
    analysisTimestampMs,
    gitVersion: version.stdout.trim(),
    boundary: {
      repositoryRoot: repositoryPath,
      canonicalRepositoryRoot: root,
      unobservedMechanisms: ["dynamic runtime loading", "reflection", "external consumers", "generated configuration"]
    },
    limits: {
      maximumCommits: 1e5,
      maximumFileStatusRecords: 1e6,
      maximumInventoriedFiles: 1e5,
      maximumGitStdoutBytes: 256 * MEBIBYTE,
      maximumGitStderrBytes: MEBIBYTE,
      maximumReferenceFileBytes: MEBIBYTE,
      maximumReferenceTotalBytes: 256 * MEBIBYTE
    },
    usage: {
      commitRecords: includedHistory.length,
      fileStatusRecords: historyOutput.statusRecordCount,
      inventoriedFiles: inventory.length,
      gitStdoutBytes: gitOutputs.reduce((total, output) => total + output.stdoutBytes, 0),
      gitStderrBytes: gitOutputs.reduce((total, output) => total + output.stderrBytes, 0),
      referenceBytes: references.acceptedBytes,
      omittedReferencePaths: references.graph.unavailablePaths.length
    },
    completeness: {
      historyComplete: !warnings.some(
        (warning) => ["empty_repository", "future_commit", "shallow_history"].includes(warning.code)
      ),
      referenceAnalysisComplete: references.graph.complete && !warnings.some((warning) => warning.code === "sparse_checkout"),
      workspaceDebrisComplete: !warnings.some((warning) => warning.code === "sparse_checkout")
    },
    statistics: {
      includedCommitCount: includedHistory.length,
      logicalFileCount: resolveRenameActivities(includedHistory).length,
      burstCount: reports.length,
      candidateFindingCount: 0,
      uniqueCandidatePathCount: 0,
      workspaceDebrisCount: workspaceDebris.length
    },
    warnings,
    bursts: reports,
    workspaceDebris
  });
}

// src/types.ts
var REPORT_SCHEMA_VERSION = 1;

// src/fossil-cli-core.ts
var _filename = fileURLToPath(import.meta.url);
var DEFAULT_NORMALIZED_ANALYSIS_OPTIONS = {
  days: 90,
  gapHours: 48,
  threshold: 0.4,
  format: "table",
  extensions: [],
  untrackedAgeDays: 90,
  exclude: [],
  verbose: false
};
function validNumber(value, minimum, maximum) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}
function isOptionsRecord(value) {
  return value !== null && typeof value === "object";
}
function validStringCollection(value, maximumLength) {
  return Array.isArray(value) && value.length <= maximumLength && value.every((item) => typeof item === "string");
}
function validateNormalizedAnalysisOptions(options) {
  if (!(isOptionsRecord(options) && validNumber(options.days, 1, 3650) && validNumber(options.gapHours, 1, 8760) && validNumber(options.threshold, 0, 1) && validNumber(options.untrackedAgeDays, 1, 3650) && (options.format === "table" || options.format === "json") && validStringCollection(options.extensions, 64) && options.extensions.every((extension) => extension.length > 0) && validStringCollection(options.exclude, Number.MAX_SAFE_INTEGER) && typeof options.verbose === "boolean"))
    throw new FossilAnalysisError({ code: "invalid_options", message: "Analysis options are invalid." });
  return {
    days: options.days,
    gapHours: options.gapHours,
    threshold: options.threshold,
    format: options.format,
    extensions: [...options.extensions],
    untrackedAgeDays: options.untrackedAgeDays,
    exclude: [...options.exclude],
    verbose: options.verbose
  };
}
var FossilUsageError = class extends Error {
  constructor(message, reported = false) {
    super(message);
    this.reported = reported;
  }
  reported;
  exitCode = 2;
};
var FossilHelpDisplayed = class extends Error {
};
var NotRepositoryAnalysisError = class extends FossilAnalysisError {
  constructor(message = "not a Git repository") {
    super({ code: "not_repository", message });
  }
};
async function analyzeRepository(repositoryPath, options, core = analyzeRepositoryCore) {
  return finalizeFossilReport(await core(repositoryPath, validateNormalizedAnalysisOptions(options)));
}
function isMainModule() {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return realpathSync2(arg) === realpathSync2(_filename);
  } catch {
    return arg === _filename;
  }
}
function commaSeparatedValues(value) {
  return value === void 0 ? [] : value.split(",").map((item) => item.trim()).filter(Boolean);
}
function finiteNumber(value, fallback, option, minimum, maximum) {
  if (value === void 0) return fallback;
  const number = Number(value);
  if (value.trim() !== "" && Number.isFinite(number) && number >= minimum && number <= maximum) return number;
  throw new FossilUsageError(`${option} must be a finite number from ${minimum} through ${maximum}.`);
}
function normalizeAnalyzeOptions(options) {
  const extensions = commaSeparatedValues(options.extensions);
  const format = options.format ?? DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.format;
  if (format !== "table" && format !== "json") throw new FossilUsageError("--format must be table or json.");
  if (extensions.length > 64) throw new FossilUsageError("--extensions accepts at most 64 nonempty values.");
  return validateNormalizedAnalysisOptions({
    days: finiteNumber(options.days, DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.days, "--days", 1, 3650),
    gapHours: finiteNumber(options.gapHours, DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.gapHours, "--gap-hours", 1, 8760),
    threshold: finiteNumber(options.threshold, DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.threshold, "--threshold", 0, 1),
    format,
    extensions,
    untrackedAgeDays: finiteNumber(
      options.untrackedAge,
      DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.untrackedAgeDays,
      "--untracked-age",
      1,
      3650
    ),
    exclude: commaSeparatedValues(options.exclude),
    verbose: options.verbose ?? DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.verbose
  });
}
function createFossilProgram({
  analyze,
  cwd = process.cwd,
  stderr = process.stderr.write.bind(process.stderr),
  stdout = process.stdout.write.bind(process.stdout)
}) {
  const program2 = new Command().name("fossil").configureOutput({ writeErr: stderr }).showHelpAfterError().exitOverride((error) => {
    if (error.code === "commander.helpDisplayed") throw new FossilHelpDisplayed();
    throw new FossilUsageError(error.message, true);
  });
  program2.command("analyze [repo-path]").option("--days <days>").option("--gap-hours <hours>").option("--threshold <threshold>").option("--format <format>").option("--extensions <extensions>").option("--untracked-age <days>").option("--exclude <patterns>").option("--verbose").action(async (repositoryPath, options) => {
    const report = await analyzeRepository(repositoryPath ?? cwd(), normalizeAnalyzeOptions(options), analyze);
    if (report.options.format === "json") stdout(renderFossilReportJson(report));
    else {
      const noFindings = report.statistics.candidateFindingCount + report.statistics.workspaceDebrisCount === 0;
      if (noFindings) {
        stdout("0 findings\n");
        return;
      }
      stdout(`${renderFossilReportTable(report, { isTty: Boolean(process.stdout.isTTY) })}
`);
    }
  });
  return program2;
}
async function runFossilCli(argv, dependencies) {
  const stderr = dependencies.stderr ?? process.stderr.write.bind(process.stderr);
  const program2 = createFossilProgram({ ...dependencies, stderr });
  try {
    await program2.parseAsync([...argv], { from: "node" });
  } catch (error) {
    if (!(error instanceof FossilUsageError)) throw error;
    const analyzeCommand = program2.commands.find((command) => command.name() === "analyze");
    if (!error.reported)
      stderr(`error: ${error.message}
${analyzeCommand?.helpInformation() ?? program2.helpInformation()}`);
    throw error;
  }
}
function boundedAnalysisDiagnostic(error) {
  const prefix = "fossil: ";
  const suffix = "\n";
  const maximumMessageBytes = 4096 - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
  let message = "";
  for (const character of error.message || `analysis failed (${error.code})`) {
    const codePoint = character.codePointAt(0) ?? 0;
    const visible = character === "\n" ? "\\n" : character === "\r" ? "\\r" : character === "	" ? "\\t" : codePoint <= 31 || codePoint >= 127 && codePoint <= 159 ? `\\x${codePoint.toString(16).padStart(2, "0")}` : character;
    if (Buffer.byteLength(message) + Buffer.byteLength(visible) > maximumMessageBytes) break;
    message += visible;
  }
  return `${prefix}${message}${suffix}`;
}
async function runFossilCliProcess(argv, dependencies) {
  try {
    await runFossilCli(argv, dependencies);
    return 0;
  } catch (error) {
    if (error instanceof FossilHelpDisplayed) return 0;
    if (error instanceof FossilUsageError) return error.exitCode;
    if (error instanceof FossilAnalysisError) {
      (dependencies.stderr ?? process.stderr.write.bind(process.stderr))(boundedAnalysisDiagnostic(error));
      return error.code === "invalid_options" ? 2 : 1;
    }
    throw error;
  }
}
async function main() {
  process.exitCode = await runFossilCliProcess(process.argv, { analyze: analyzeRepositoryCore });
}
if (isMainModule()) {
  main().catch((err) => {
    process.stderr.write(`fossil CLI failed: ${err}
`);
    process.exit(1);
  });
}
export {
  DEFAULT_NORMALIZED_ANALYSIS_OPTIONS,
  FossilAnalysisError,
  FossilUsageError,
  NotRepositoryAnalysisError,
  REPORT_SCHEMA_VERSION,
  analyzeRepository,
  createFossilProgram,
  runFossilCli,
  runFossilCliProcess
};
