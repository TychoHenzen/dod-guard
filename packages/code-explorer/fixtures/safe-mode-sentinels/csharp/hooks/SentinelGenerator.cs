using Microsoft.CodeAnalysis;

namespace SafeModeSentinel;

[Generator(LanguageNames.CSharp)]
public sealed class SentinelGenerator : IIncrementalGenerator
{
    private readonly string generatorHook = "generator-initialize";

    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        Tripwire.Trigger(generatorHook);
    }
}
