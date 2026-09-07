using Microsoft.CodeAnalysis;

namespace SafeModeSentinel;

[Generator(LanguageNames.CSharp)]
public sealed class SentinelGenerator : IIncrementalGenerator
{
    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        Tripwire.Trigger("generator-initialize");
    }
}
