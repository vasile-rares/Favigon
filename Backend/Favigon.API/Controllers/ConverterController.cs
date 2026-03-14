using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Favigon.API.Controllers;

[ApiController]
[Route("api/converter")]
public class ConverterController(IConverterService converterService) : ControllerBase
{
    [HttpPost("generate")]
    public IActionResult Generate([FromBody] ConverterRequest request)
    {
        if (request.Ir is null)
            throw new ArgumentException("IR node is required.");

        var result = converterService.Generate(request.Ir, request.Framework);

        return Ok(result);
    }

    [HttpPost("validate")]
    public IActionResult Validate([FromBody] ConverterRequest request)
    {
        if (request.Ir is null)
            throw new ArgumentException("IR node is required.");

        var isValid = converterService.Validate(request.Ir);

        return Ok(new ConverterResponse
        {
            IsValid = isValid
        });
    }
}


