using Prismatic.Application.DTOs.Requests;
using Prismatic.Application.DTOs.Responses;
using Prismatic.Application.Pipeline;
using Microsoft.AspNetCore.Mvc;

namespace Prismatic.API.Controllers;

[ApiController]
[Route("api/converter")]
public class ConverterController(ConverterPipeline pipeline) : ControllerBase
{
    [HttpPost("generate")]
    public IActionResult Generate([FromBody] ConverterRequest request)
    {
        if (request.Ir is null)
            return BadRequest(new { error = "IR node is required." });

        var result = pipeline.Generate(request.Ir, request.Framework, request.Flavor);

        if (!result.ValidationResult.IsValid)
            return UnprocessableEntity(new
            {
                error = "IR validation failed.",
                errors = result.ValidationResult.Errors
                                   .Select(e => new { path = e.Path, message = e.Message })
            });

        if (!result.IsSuccess)
            return BadRequest(new { error = result.ErrorMessage });

        return Ok(new ConverterResponse
        {
            Framework = request.Framework,
            Flavor = request.Flavor,
            Html = result.Html!,
            Css = result.Css!
        });
    }

    [HttpPost("validate")]
    public IActionResult Validate([FromBody] ConverterRequest request)
    {
        if (request.Ir is null)
            return BadRequest(new { error = "IR node is required." });

        var result = pipeline.Validate(request.Ir);

        return Ok(new ConverterValidationResponse
        {
            IsValid = result.IsValid,
            Errors = result.Errors.Select(e => new ConverterValidationError { Path = e.Path, Message = e.Message })
        });
    }
}


